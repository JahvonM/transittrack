package com.transittrack.app;
import java.util.*;

/** Durable single-process execution gate. Persistence must succeed before side effects. */
final class ControlReceiptLedger {
    interface Store { Map<String,String> read(); boolean commit(Map<String,String> values); }
    static final long RETENTION = 24 * 3600000L;
    private final Store store;
    ControlReceiptLedger(Store store) { this.store = store; }
    private static final class Row {
        long at; String device, code; boolean reported;
        Row(long at, String device, String code, boolean reported) { this.at=at; this.device=device; this.code=code; this.reported=reported; }
        String encode() { return at + "|" + device + "|" + code + "|" + (reported ? "1" : "0"); }
    }
    private Row decode(String raw) {
        try {
            String[] parts=raw.split("\\|", -1);
            if(parts.length!=4 || !parts[1].matches("[A-Za-z0-9_-]{6,64}") || !parts[2].matches("[A-Z_]{2,40}") || !parts[3].matches("[01]")) return null;
            return new Row(Long.parseLong(parts[0]),parts[1],parts[2],"1".equals(parts[3]));
        } catch(Exception ignored) { return null; }
    }
    synchronized String receipt(String id) {
        String raw=store.read().get(id);
        if(raw==null) return null;
        Row row=decode(raw);return row==null ? "INTERRUPTED" : row.code;
    }
    synchronized boolean reserve(String id,String device,long now) {
        if(!TabletControlPolicy.id(id) || device==null || !device.matches("[A-Za-z0-9_-]{6,64}"))return false;
        Map<String,String> rows=new LinkedHashMap<>(store.read());
        if(rows.containsKey(id))return false;
        Iterator<Map.Entry<String,String>> iterator=rows.entrySet().iterator();
        while(iterator.hasNext()) {
            Row row=decode(iterator.next().getValue());
            // Unknown/corrupt/future entries retained. Never evict fresh receipts.
            if(row!=null && now>=row.at && now-row.at>RETENTION)iterator.remove();
        }
        if(rows.size()>=128)return false;
        rows.put(id,new Row(now,device,"INTERRUPTED",false).encode());
        return store.commit(rows);
    }
    synchronized boolean complete(String id,String code) {
        if(code==null || !code.matches("[A-Z_]{2,40}"))return false;
        Map<String,String> rows=new LinkedHashMap<>(store.read());Row row=decode(rows.get(id));
        if(row==null)return false;
        row.code=code;row.reported=false;rows.put(id,row.encode());return store.commit(rows);
    }
    synchronized void reported(String id) {
        Map<String,String> rows=new LinkedHashMap<>(store.read());Row row=decode(rows.get(id));
        if(row==null)return;row.reported=true;rows.put(id,row.encode());store.commit(rows);
    }
    synchronized List<String> pending(String device,long now) {
        List<String> ids=new ArrayList<>();
        for(Map.Entry<String,String> item:store.read().entrySet()) {
            Row row=decode(item.getValue());
            if(row!=null && row.device.equals(device) && !row.reported && now>=row.at && now-row.at<=RETENTION && ids.size()<4)ids.add(item.getKey());
        }
        return ids;
    }
    synchronized long lastRebootAt() {
        long latest=0;
        for(String raw:store.read().values()) {Row row=decode(raw);if(row!=null && "REBOOT_REQUESTED".equals(row.code))latest=Math.max(latest,row.at);}
        return latest;
    }
}
