package com.saiful.liftridemeter;

import android.os.Bundle;

import com.getcapacitor.BridgeActivity;

/** Design & Developed by Md. Saiful Islam */
public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        // Custom plugin অবশ্যই super.onCreate-এর আগে register করতে হয়
        registerPlugin(LiftSensorPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
