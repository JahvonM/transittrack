import UIKit
import Capacitor

// Registers McSween Driver's own native part (GPS with the screen off).
// Main.storyboard uses this instead of the plain CAPBridgeViewController.
class DriverViewController: CAPBridgeViewController {
    override open func capacitorDidLoad() {
        bridge?.registerPluginInstance(DriverBackgroundPlugin())
    }
}
