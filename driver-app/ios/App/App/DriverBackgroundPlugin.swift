import Foundation
import UIKit
import CoreLocation
import Capacitor

// GPS with the screen off on a driver's own iPhone (McSween Driver).
// The iPhone version of android/.../DriverLocationService.kt, with the same
// JavaScript calls (src/lib/driverBackground.js) and the same rules:
//  - it only starts from the open driver app, after the server confirms the
//    phone's pairing, the driver PIN grant and the bus (background_check);
//  - it uses "While Using" location only. iOS keeps it going with the screen
//    off and shows the blue location pill; no "Always" permission is asked;
//  - every point is saved on the phone first, then uploaded, and keeps the
//    bus and company it was taken for;
//  - a server "no" (new PIN, other bus, unpaired, tracking off) stops it.
@objc(DriverBackgroundPlugin)
public class DriverBackgroundPlugin: CAPPlugin, CAPBridgedPlugin, CLLocationManagerDelegate {
    public let identifier = "DriverBackgroundPlugin"
    public let jsName = "DriverBackground"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "getState", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "setEnabled", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "stop", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "configure", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "pulse", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "beginUpload", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "endUpload", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "savedPoints", returnType: CAPPluginReturnPromise),
    ]

    // Same server and app id as android/.../DriverTrackingHttp.kt.
    static let endpoint = URL(string: "https://ghqpznxqngvhmkiwcauj.supabase.co/functions/v1/driverSession")!
    static let appId = "6a98b192be27b5f9635020ba"

    private static let fields = ["device_id", "device_token", "driver_grant", "expected_device_id", "expected_company_id", "expected_vehicle_id"]
    private static let maxPoints = 9500
    private static let enabledKey = "tt_driver_background_enabled"

    private let work = DispatchQueue(label: "com.mcsweenstransport.driver.gps")
    private var manager: CLLocationManager?
    private var permissionCall: CAPPluginCall?
    private var lease: [String: Any]?
    private var queue: [[String: Any]] = []
    private var review = 0
    private var active = false
    private var status = "Background GPS is off"
    private var lastFixAt: Double = 0
    private var lastSaved: Double = 0
    private var newest: [String: Any]?
    private var busy = false
    private var nextNetwork: Double = 0
    private var failures = 0
    private var checkedAt: Double = 0
    private var historyAt: Double = 0
    private var pulseAt: Double = 0
    private var exportKey = ""
    private var exportAt: Double = 0
    private var generation = 0
    private var configuring = false
    private var timer: DispatchSourceTimer?

    private lazy var session: URLSession = {
        let config = URLSessionConfiguration.ephemeral
        config.timeoutIntervalForRequest = 8
        config.timeoutIntervalForResource = 15
        config.httpCookieAcceptPolicy = .never
        config.urlCache = nil
        return URLSession(configuration: config, delegate: NoRedirects(), delegateQueue: nil)
    }()

    public override func load() {
        work.sync {
            queue = readJSON("driver_gps_queue.json") as? [[String: Any]] ?? []
            review = (readJSON("driver_gps_review.json") as? [String: Any])?["count"] as? Int ?? 0
            lease = readJSON("driver_gps_lease.json") as? [String: Any]
        }
    }

    // MARK: - JavaScript calls

    @objc func getState(_ call: CAPPluginCall) {
        work.async {
            call.resolve(["available": true, "enabled": self.enabled(), "active": self.active, "status": self.status,
                          "pending": self.queue.count, "review": self.review])
        }
    }

    @objc func setEnabled(_ call: CAPPluginCall) {
        guard call.getBool("enabled", false) else {
            UserDefaults.standard.set(false, forKey: Self.enabledKey)
            stopTracking(clearLease: true)
            call.resolve(["enabled": false])
            return
        }
        DispatchQueue.main.async {
            guard UIApplication.shared.applicationState == .active else {
                call.reject("Open the driver settings on this phone to turn on background GPS.")
                return
            }
            switch self.authorization() {
            case .notDetermined:
                self.permissionCall = call
                self.locationManager().requestWhenInUseAuthorization()
            case .authorizedWhenInUse, .authorizedAlways:
                UserDefaults.standard.set(true, forKey: Self.enabledKey)
                call.resolve(["enabled": true])
            default:
                call.reject("Location is off for McSween Driver. Turn it on in the iPhone's Settings → McSween Driver → Location.")
            }
        }
    }

    @objc func stop(_ call: CAPPluginCall) {
        stopTracking(clearLease: true)
        call.resolve()
    }

    @objc func pulse(_ call: CAPPluginCall) {
        work.async { self.pulseAt = Date().timeIntervalSince1970 }
        call.resolve()
    }

    // The page never gets this service's fixes on iPhone, so it never needs
    // to hand an upload over; these keep the shared JavaScript working.
    @objc func beginUpload(_ call: CAPPluginCall) { call.resolve(["granted": true, "id": UUID().uuidString]) }
    @objc func endUpload(_ call: CAPPluginCall) { call.resolve() }

    @objc func configure(_ call: CAPPluginCall) {
        guard enabled() else { call.resolve(["managed": false]); return }
        var data: [String: Any] = [:]
        for key in Self.fields {
            let value = call.getString(key) ?? ""
            let ok = ["device_token", "driver_grant"].contains(key)
                ? value.range(of: "^[a-f0-9]{64}$", options: .regularExpression) != nil
                : value.range(of: "^[A-Za-z0-9_-]{1,128}$", options: .regularExpression) != nil
            guard ok else { call.reject("Current device pairing and driver PIN verification are required."); return }
            data[key] = value
        }
        DispatchQueue.main.async {
            let status = self.authorization()
            guard UIApplication.shared.applicationState == .active,
                  status == .authorizedWhenInUse || status == .authorizedAlways else {
                call.reject("Open the driver app and allow location to start background GPS.")
                return
            }
            self.work.async { self.configureLease(call, data) }
        }
    }

    @objc func savedPoints(_ call: CAPPluginCall) {
        var auth: [String: Any] = [:]
        for key in Self.fields { auth[key] = call.getString(key) ?? "" }
        let key = Self.fields.map { auth[$0] as? String ?? "" }.joined(separator: "|")
        work.async {
            let now = Date().timeIntervalSince1970
            let fresh = key == self.exportKey && now - self.exportAt <= 60 && (call.getInt("cursor") ?? 0) != 0
            let send = { () -> Void in
                let binding = self.binding(auth)
                let points = self.queue.filter { self.binding($0) == binding }
                call.resolve(["points": points, "done": true, "cursor": points.count, "max": points.count])
            }
            if fresh { send(); return }
            self.post(self.credentials(auth, "background_export_check")) { result in
                self.work.async {
                    guard case .success(let body) = result, body["ok"] as? Bool == true else {
                        call.reject("Saved GPS could not be exported. Data has not been cleared.")
                        return
                    }
                    self.exportKey = key
                    self.exportAt = Date().timeIntervalSince1970
                    send()
                }
            }
        }
    }

    // MARK: - Lease (checked on the work queue)

    private func configureLease(_ call: CAPPluginCall, _ data: [String: Any]) {
        if let prior = lease, Self.fields.allSatisfy({ (prior[$0] as? String) == (data[$0] as? String) }), leaseValid(prior) {
            startTracking()
            call.resolve(["managed": true])
            return
        }
        guard !configuring else { call.reject("GPS setup is already being checked."); return }
        configuring = true
        let started = generation
        post(credentials(data, "background_check")) { result in
            self.work.async {
                self.configuring = false
                guard started == self.generation else { call.reject("Return to the driver app to start GPS."); return }
                guard case .success(let body) = result else {
                    call.reject("Could not verify background GPS. Check the connection, the phone's time and the driver PIN.")
                    return
                }
                guard body["ok"] as? Bool == true, body["tracking"] as? Bool == true,
                      let server = Self.date(body["server_time"]), let expires = Self.date(body["expires_at"]) else {
                    call.resolve(["managed": false])
                    return
                }
                let now = Date().timeIntervalSince1970
                guard abs(now - server) <= 60 else {
                    call.reject("This phone's clock is wrong. Set the date and time to automatic, then try again.")
                    return
                }
                var next = data
                next["verified_at"] = now
                next["expires_at_s"] = min(expires, now + 20 * 3600)
                guard self.leaseValid(next) else { call.reject("Driver verification has expired. Enter the PIN again."); return }
                if self.active { self.stopTracking(clearLease: false) }
                self.lease = next
                self.writeJSON("driver_gps_lease.json", next)
                self.startTracking()
                call.resolve(["managed": true])
            }
        }
    }

    private func leaseValid(_ l: [String: Any]?) -> Bool {
        guard let l = l, let verified = l["verified_at"] as? Double, let expires = l["expires_at_s"] as? Double else { return false }
        let now = Date().timeIntervalSince1970
        return verified > 0 && now >= verified - 60 && expires > now && expires > verified && expires - verified <= 20 * 3600 && enabled()
    }

    private func enabled() -> Bool { UserDefaults.standard.bool(forKey: Self.enabledKey) }

    // MARK: - Location

    private func startTracking() {
        guard !active else { return }
        active = true
        status = "Waiting for GPS"
        DispatchQueue.main.async {
            let m = self.locationManager()
            m.desiredAccuracy = kCLLocationAccuracyBestForNavigation
            m.distanceFilter = 10
            m.activityType = .automotiveNavigation
            m.pausesLocationUpdatesAutomatically = false
            m.allowsBackgroundLocationUpdates = true
            m.showsBackgroundLocationIndicator = true
            m.startUpdatingLocation()
        }
        let t = DispatchSource.makeTimerSource(queue: work)
        t.schedule(deadline: .now() + 15, repeating: 15)
        t.setEventHandler { [weak self] in self?.tick() }
        t.resume()
        timer = t
    }

    private func stopTracking(clearLease: Bool) {
        work.async {
            self.generation += 1
            self.active = false
            self.timer?.cancel()
            self.timer = nil
            self.status = "Background GPS is off"
            if clearLease {
                self.lease = nil
                self.exportKey = ""
                self.removeFile("driver_gps_lease.json")
            }
        }
        DispatchQueue.main.async {
            self.manager?.stopUpdatingLocation()
            self.manager?.allowsBackgroundLocationUpdates = false
        }
    }

    private func locationManager() -> CLLocationManager {
        if let m = manager { return m }
        let m = CLLocationManager()
        m.delegate = self
        manager = m
        return m
    }

    private func authorization() -> CLAuthorizationStatus {
        if #available(iOS 14.0, *) { return locationManager().authorizationStatus }
        return CLLocationManager.authorizationStatus()
    }

    public func locationManagerDidChangeAuthorization(_ manager: CLLocationManager) { authorizationChanged() }
    public func locationManager(_ manager: CLLocationManager, didChangeAuthorization status: CLAuthorizationStatus) { authorizationChanged() }

    private func authorizationChanged() {
        let status = authorization()
        if let call = permissionCall, status != .notDetermined {
            permissionCall = nil
            if status == .authorizedWhenInUse || status == .authorizedAlways {
                UserDefaults.standard.set(true, forKey: Self.enabledKey)
                call.resolve(["enabled": true])
            } else {
                call.reject("Location permission is required. Background GPS stays off.")
            }
        }
        if status == .denied || status == .restricted {
            work.async { if self.active { self.status = "Location is off for McSween Driver"; self.stopTracking(clearLease: false) } }
        }
    }

    public func locationManager(_ manager: CLLocationManager, didFailWithError error: Error) {
        work.async { if self.active { self.status = "Waiting for GPS" } }
    }

    public func locationManager(_ manager: CLLocationManager, didUpdateLocations locations: [CLLocation]) {
        guard let p = locations.last else { return }
        work.async { self.sample(p) }
    }

    private func sample(_ p: CLLocation) {
        guard active else { return }
        guard leaseValid(lease), let l = lease else {
            status = "Driver verification expired; open the driver app"
            stopTracking(clearLease: false)
            return
        }
        let now = Date().timeIntervalSince1970
        let t = p.timestamp.timeIntervalSince1970
        let speed = p.speed >= 0 ? p.speed : 0
        guard p.horizontalAccuracy >= 0, p.horizontalAccuracy <= 100, abs(p.coordinate.latitude) <= 90, abs(p.coordinate.longitude) <= 180,
              speed <= 100, t <= now + 2, t >= now - 10 else { return }
        lastFixAt = t
        status = "Sharing (phone GPS, screen off is fine)"
        if now - lastSaved < 8 { return }
        lastSaved = now
        var point: [String: Any] = [
            "queue_id": UUID().uuidString, "lat": p.coordinate.latitude, "lng": p.coordinate.longitude,
            "speed": speed, "accuracy": p.horizontalAccuracy, "timestamp": NSNumber(value: Int64(t * 1000)), "t": Self.iso(t),
        ]
        if p.course >= 0 { point["heading"] = p.course }
        for key in ["expected_device_id", "expected_company_id", "expected_vehicle_id"] { point[key] = l[key] }
        queue.append(point)
        if queue.count > Self.maxPoints { queue.removeFirst(queue.count - Self.maxPoints) }
        writeJSON("driver_gps_queue.json", queue)
        newest = point
        tick()
    }

    // MARK: - Upload (work queue)

    private func pageUploading() -> Bool {
        // While the driver app is on screen, the page sends the live position itself.
        var visible = false
        DispatchQueue.main.sync { visible = UIApplication.shared.applicationState == .active }
        return visible && Date().timeIntervalSince1970 - pulseAt <= 20
    }

    private func tick() {
        guard active, let l = lease else { return }
        guard leaseValid(l) else { status = "Driver verification expired; open the driver app"; stopTracking(clearLease: false); return }
        let now = Date().timeIntervalSince1970
        guard !busy, now >= nextNetwork else { return }
        busy = true
        let started = generation
        let bind = binding(l)
        let batch = Array(queue.filter { binding($0) == bind }.prefix(100))
        var live: [String: Any]? = nil
        if !pageUploading(), let p = newest, let ms = (p["timestamp"] as? NSNumber)?.doubleValue, now - ms / 1000 <= 30 { live = p }
        var steps: [(String, [String: Any])] = []
        if now - checkedAt >= 60 {
            var body = credentials(l, "background_check")
            body["native_tracking_health"] = ["pending": queue.count, "review": review, "last_fix_at": Int64(lastFixAt * 1000)]
            steps.append(("check", body))
        }
        if let p = live, let speed = p["speed"] as? Double {
            var body = credentials(l, "background_location")
            body["lat"] = p["lat"]; body["lng"] = p["lng"]; body["speed"] = speed
            body["status"] = speed * 3.6 > 100 ? "speeding" : "on_trip"
            body["recorded_at"] = p["t"]
            steps.append(("live", body))
        }
        if !batch.isEmpty && now - historyAt >= 60 {
            var body = credentials(l, "upload_track")
            body["queue_replay"] = true
            body["points"] = batch
            steps.append(("history", body))
        }
        run(steps, started: started, batch: batch)
    }

    private func run(_ steps: [(String, [String: Any])], started: Int, batch: [[String: Any]]) {
        guard let (kind, body) = steps.first else { finish(started: started, denied: false, retry: 0, ok: true); return }
        let rest = Array(steps.dropFirst())
        let task = beginBackgroundTask()
        post(body) { result in
            self.work.async {
                self.endBackgroundTask(task)
                guard started == self.generation, self.active else { self.busy = false; return }
                let now = Date().timeIntervalSince1970
                switch result {
                case .success(let reply):
                    if kind == "check" {
                        guard reply["tracking"] as? Bool == true else { self.finish(started: started, denied: true, retry: 0, ok: false); return }
                        self.checkedAt = now
                    } else if kind == "live" {
                        if reply["tracking"] as? Bool == false { self.finish(started: started, denied: true, retry: 0, ok: false); return }
                        guard reply["ok"] as? Bool == true else { self.finish(started: started, denied: false, retry: 0, ok: false); return }
                    } else {
                        guard reply["ok"] as? Bool == true, (reply["received"] as? Int) == batch.count else {
                            self.finish(started: started, denied: false, retry: 0, ok: false); return
                        }
                        self.acknowledge(batch, review: false)
                        self.historyAt = now
                    }
                    self.run(rest, started: started, batch: batch)
                case .failure(let error):
                    let http = error as? HttpError
                    if kind == "history", case .rejected(let code, _)? = http, code == 400 || code == 409 {
                        // The server can't take these points; keep counting them for the office.
                        self.acknowledge(batch, review: true)
                        self.run(rest, started: started, batch: batch)
                        return
                    }
                    if case .rejected(let code, let retry)? = http {
                        self.finish(started: started, denied: [401, 403, 404, 409].contains(code), retry: retry, ok: false)
                    } else {
                        self.finish(started: started, denied: false, retry: 0, ok: false)
                    }
                }
            }
        }
    }

    private func finish(started: Int, denied: Bool, retry: Double, ok: Bool) {
        busy = false
        guard started == generation else { return }
        if denied {
            status = "Driver PIN or bus changed; open the driver app"
            stopTracking(clearLease: true)
            return
        }
        if ok { failures = 0; nextNetwork = Date().timeIntervalSince1970 + 15; return }
        failures += 1
        let backoff = min(300, 15 * pow(2, Double(min(failures, 5))))
        nextNetwork = Date().timeIntervalSince1970 + max(backoff, min(max(0, retry), 3600))
        status = "GPS saved on this phone; waiting to upload"
    }

    private func acknowledge(_ points: [[String: Any]], review flagged: Bool) {
        let ids = Set(points.compactMap { $0["queue_id"] as? String })
        queue.removeAll { ids.contains($0["queue_id"] as? String ?? "") }
        writeJSON("driver_gps_queue.json", queue)
        if flagged {
            review += points.count
            writeJSON("driver_gps_review.json", ["count": review])
        }
    }

    private func beginBackgroundTask() -> UIBackgroundTaskIdentifier {
        var id = UIBackgroundTaskIdentifier.invalid
        DispatchQueue.main.sync { id = UIApplication.shared.beginBackgroundTask(withName: "driver-gps-upload", expirationHandler: nil) }
        return id
    }

    private func endBackgroundTask(_ id: UIBackgroundTaskIdentifier) {
        guard id != .invalid else { return }
        DispatchQueue.main.async { UIApplication.shared.endBackgroundTask(id) }
    }

    // MARK: - HTTP

    enum HttpError: Error { case rejected(Int, Double), transport, malformed }

    private func credentials(_ l: [String: Any], _ action: String) -> [String: Any] {
        var body: [String: Any] = [:]
        for key in Self.fields { body[key] = l[key] }
        body["action"] = action
        body["native_background"] = true
        return body
    }

    private func binding(_ l: [String: Any]) -> String {
        ["expected_device_id", "expected_company_id", "expected_vehicle_id"].map { l[$0] as? String ?? "" }.joined(separator: "|")
    }

    private func post(_ body: [String: Any], done: @escaping (Result<[String: Any], Error>) -> Void) {
        guard let data = try? JSONSerialization.data(withJSONObject: body), data.count < 64000 else { done(.failure(HttpError.malformed)); return }
        var request = URLRequest(url: Self.endpoint)
        request.httpMethod = "POST"
        request.httpBody = data
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue(Self.appId, forHTTPHeaderField: "X-App-Id")
        session.dataTask(with: request) { bytes, response, error in
            guard error == nil, let http = response as? HTTPURLResponse else { done(.failure(HttpError.transport)); return }
            guard http.statusCode == 200 else {
                let retry = Double(http.value(forHTTPHeaderField: "Retry-After") ?? "") ?? 0
                done(.failure(HttpError.rejected(http.statusCode, min(max(retry, 0), 3600))))
                return
            }
            guard let bytes = bytes, bytes.count <= 16384,
                  let json = try? JSONSerialization.jsonObject(with: bytes) as? [String: Any] else { done(.failure(HttpError.malformed)); return }
            done(.success(json))
        }.resume()
    }

    private final class NoRedirects: NSObject, URLSessionTaskDelegate {
        func urlSession(_ session: URLSession, task: URLSessionTask, willPerformHTTPRedirection response: HTTPURLResponse,
                        newRequest request: URLRequest, completionHandler: @escaping (URLRequest?) -> Void) {
            completionHandler(nil)
        }
    }

    // MARK: - Files (kept until first unlock after a restart, like Android's no-backup files)

    private func fileURL(_ name: String) -> URL? {
        guard let dir = try? FileManager.default.url(for: .applicationSupportDirectory, in: .userDomainMask, appropriateFor: nil, create: true) else { return nil }
        var url = dir.appendingPathComponent(name)
        var values = URLResourceValues()
        values.isExcludedFromBackup = true
        try? url.setResourceValues(values)
        return url
    }

    private func readJSON(_ name: String) -> Any? {
        guard let url = fileURL(name), let data = try? Data(contentsOf: url) else { return nil }
        return try? JSONSerialization.jsonObject(with: data)
    }

    private func writeJSON(_ name: String, _ value: Any) {
        guard let url = fileURL(name), let data = try? JSONSerialization.data(withJSONObject: value) else { return }
        try? data.write(to: url, options: [.atomic, .completeFileProtectionUntilFirstUserAuthentication])
    }

    private func removeFile(_ name: String) {
        guard let url = fileURL(name) else { return }
        try? FileManager.default.removeItem(at: url)
    }

    private static func iso(_ t: Double) -> String {
        let f = ISO8601DateFormatter()
        f.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return f.string(from: Date(timeIntervalSince1970: t))
    }

    private static func date(_ value: Any?) -> Double? {
        guard let s = value as? String else { return nil }
        let f = ISO8601DateFormatter()
        f.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        if let d = f.date(from: s) { return d.timeIntervalSince1970 }
        f.formatOptions = [.withInternetDateTime]
        return f.date(from: s)?.timeIntervalSince1970
    }
}
