package com.transittrack.app;
import org.junit.Test;
import static org.junit.Assert.*;
import java.util.*;
import java.util.concurrent.*;
import java.util.concurrent.atomic.AtomicInteger;
public class ControlReceiptLedgerTest {
    static class Disk implements ControlReceiptLedger.Store {
        Map<String,String> rows=new LinkedHashMap<>();boolean writable=true;
        public Map<String,String> read(){return new LinkedHashMap<>(rows);}
        public boolean commit(Map<String,String> values){if(!writable)return false;rows=new LinkedHashMap<>(values);return true;}
    }
    String id(int i){return String.format("%032x",i);}
    @Test public void processRestartCannotRepeatReservedOrCompletedAction() {
        Disk disk=new Disk();ControlReceiptLedger first=new ControlReceiptLedger(disk);
        assertTrue(first.reserve(id(1),"tablet1",1000));
        ControlReceiptLedger restarted=new ControlReceiptLedger(disk);
        assertEquals("INTERRUPTED",restarted.receipt(id(1)));assertFalse(restarted.reserve(id(1),"tablet1",2000));
        assertTrue(restarted.complete(id(1),"REBOOT_REQUESTED"));
        assertEquals("REBOOT_REQUESTED",new ControlReceiptLedger(disk).receipt(id(1)));
        assertFalse(new ControlReceiptLedger(disk).reserve(id(1),"tablet1",3000));
    }
    @Test public void parallelReservationAllowsOneExecutor() throws Exception {
        Disk disk=new Disk();ControlReceiptLedger ledger=new ControlReceiptLedger(disk);AtomicInteger accepted=new AtomicInteger();
        ExecutorService workers=Executors.newFixedThreadPool(8);
        List<Future<?>> calls=new ArrayList<>();
        for(int i=0;i<50;i++)calls.add(workers.submit(()->{if(ledger.reserve(id(2),"tablet1",1000))accepted.incrementAndGet();}));
        for(Future<?> call:calls)call.get();workers.shutdownNow();assertEquals(1,accepted.get());
    }
    @Test public void storageFailureDoesNotPermitExecution() {
        Disk disk=new Disk();disk.writable=false;ControlReceiptLedger ledger=new ControlReceiptLedger(disk);
        assertFalse(ledger.reserve(id(1),"tablet1",1000));assertNull(ledger.receipt(id(1)));
        disk.writable=true;assertTrue(ledger.reserve(id(1),"tablet1",1000));disk.writable=false;
        assertFalse(ledger.complete(id(1),"REBOOT_REQUESTED"));assertEquals("INTERRUPTED",ledger.receipt(id(1)));
    }
    @Test public void boundedLedgerNeverEvictsFreshReceiptsAndRetainsOnClockRollback() {
        Disk disk=new Disk();ControlReceiptLedger ledger=new ControlReceiptLedger(disk);
        for(int i=0;i<128;i++)assertTrue(ledger.reserve(id(i),"tablet1",10000));
        assertFalse(ledger.reserve(id(129),"tablet1",9999));
        assertFalse(ledger.reserve(id(129),"tablet1",11000));
        assertTrue(ledger.reserve(id(129),"tablet1",10001+ControlReceiptLedger.RETENTION));
        assertEquals("INTERRUPTED",ledger.receipt(id(129)));
    }
    @Test public void resultDeliveryIsDeviceBoundAndRetriesWithoutRepeatingAction() {
        Disk disk=new Disk();ControlReceiptLedger ledger=new ControlReceiptLedger(disk);
        ledger.reserve(id(1),"tablet1",1000);ledger.reserve(id(2),"tablet2",1000);ledger.complete(id(1),"REBOOT_REQUESTED");
        assertEquals(Collections.singletonList(id(1)),ledger.pending("tablet1",2000));
        assertEquals(1000,ledger.lastRebootAt());
        ledger.reported(id(1));assertTrue(ledger.pending("tablet1",2000).isEmpty());
        assertEquals("REBOOT_REQUESTED",ledger.receipt(id(1)));
    }
}
