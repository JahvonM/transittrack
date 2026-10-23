package com.transittrack.fixture;

import android.os.ResultReceiver;

/** Matches Android's public AIDL contract and private generated proxy shape. */
public final class TetheringFixture {
    public interface Contract {
        void startTethering(int type,ResultReceiver result,boolean provisioning,String caller);
        void stopTethering(int type,String caller);
    }
    private static final class Proxy implements Contract {
        int type=-1; boolean provisioning; String caller; ResultReceiver result;
        @Override public void startTethering(int type,ResultReceiver result,boolean provisioning,String caller) {
            this.type=type;this.result=result;this.provisioning=provisioning;this.caller=caller;
        }
        @Override public void stopTethering(int type,String caller) { this.type=type;this.caller=caller; }
    }
    public static Object proxy(){return new Proxy();}
    public static String caller(Object p){return ((Proxy)p).caller;}
    public static int type(Object p){return ((Proxy)p).type;}
    public static boolean provisioning(Object p){return ((Proxy)p).provisioning;}
    public static void complete(Object p,int code){((Proxy)p).result.send(code,null);}
}
