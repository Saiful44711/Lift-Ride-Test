package com.saiful.liftridemeter;

import android.content.Context;
import android.hardware.Sensor;
import android.hardware.SensorEvent;
import android.hardware.SensorEventListener;
import android.hardware.SensorManager;
import android.os.Handler;
import android.os.HandlerThread;
import android.os.Looper;
import android.os.SystemClock;
import android.view.WindowManager;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * LiftSensor — Lift Ride Test-এর native sensor plugin.
 * কাজ: (১) Accelerometer 100–200 Hz-এ পড়া, (২) Barometer (pressure) পড়া,
 *      (৩) রেকর্ডিং চলাকালে স্ক্রিন জাগিয়ে রাখা।
 * ডেটা JS-এ "batch" ইভেন্টে আসে: {t:[s], ax:[], ay:[], az:[], pt:[s], p:[hPa]}
 *
 * Design & Developed by Md. Saiful Islam
 */
@CapacitorPlugin(name = "LiftSensor")
public class LiftSensorPlugin extends Plugin implements SensorEventListener {

    private static final int CAP = 4096;

    private SensorManager sm;
    private Sensor accel;
    private Sensor baro;
    private HandlerThread thread;
    private Handler bg;
    private final Handler main = new Handler(Looper.getMainLooper());
    private volatile boolean running = false;

    // নিচের বাফারগুলো শুধু sensor thread (bg) থেকে ব্যবহার হয়
    private final double[] t = new double[CAP];
    private final double[] ax = new double[CAP];
    private final double[] ay = new double[CAP];
    private final double[] az = new double[CAP];
    private final double[] pt = new double[CAP];
    private final double[] p = new double[CAP];
    private int na = 0;
    private int np = 0;
    private long lastFlush = 0;

    private void ensureSensors() {
        if (sm == null) {
            sm = (SensorManager) getContext().getSystemService(Context.SENSOR_SERVICE);
        }
        if (sm != null) {
            if (accel == null) {
                accel = sm.getDefaultSensor(Sensor.TYPE_ACCELEROMETER);
            }
            if (baro == null) {
                baro = sm.getDefaultSensor(Sensor.TYPE_PRESSURE);
            }
        }
    }

    @PluginMethod
    public void getInfo(PluginCall call) {
        ensureSensors();
        JSObject o = new JSObject();
        o.put("accel", accel != null);
        o.put("baro", baro != null);
        o.put("accelName", accel != null ? accel.getName() : "");
        o.put("baroName", baro != null ? baro.getName() : "");
        int minDelay = accel != null ? accel.getMinDelay() : 0;
        o.put("accelMaxRate", minDelay > 0 ? 1000000.0 / minDelay : 0.0);
        call.resolve(o);
    }

    @PluginMethod
    public void start(PluginCall call) {
        if (running) {
            call.resolve();
            return;
        }
        ensureSensors();
        if (sm == null || accel == null) {
            call.reject("এই ফোনে Accelerometer পাওয়া যায়নি");
            return;
        }
        Integer rateArg = call.getInt("rate", 200);
        int rate = (rateArg == null || rateArg < 20) ? 200 : rateArg;
        int accelDelayUs = 1000000 / rate;

        na = 0;
        np = 0;
        lastFlush = SystemClock.elapsedRealtime();
        thread = new HandlerThread("LiftSensorThread");
        thread.start();
        bg = new Handler(thread.getLooper());

        boolean okA = sm.registerListener(this, accel, accelDelayUs, bg);
        boolean okB = true;
        if (baro != null) {
            okB = sm.registerListener(this, baro, 40000, bg); // ~25 Hz
        }
        if (!okA) {
            stopInternal();
            call.reject("Accelerometer চালু করা যায়নি");
            return;
        }
        running = true;
        keepScreenOn(true);
        JSObject o = new JSObject();
        o.put("baroStarted", baro != null && okB);
        call.resolve(o);
    }

    @PluginMethod
    public void stop(PluginCall call) {
        stopInternal();
        call.resolve();
    }

    private void stopInternal() {
        running = false;
        if (sm != null) {
            sm.unregisterListener(this);
        }
        if (bg != null) {
            // বাকি ডেটা পাঠিয়ে থ্রেড বন্ধ
            bg.post(new Runnable() {
                @Override
                public void run() {
                    flush();
                }
            });
        }
        if (thread != null) {
            thread.quitSafely();
            thread = null;
            bg = null;
        }
        keepScreenOn(false);
    }

    private void keepScreenOn(final boolean on) {
        try {
            if (getActivity() == null) {
                return;
            }
            getActivity().runOnUiThread(new Runnable() {
                @Override
                public void run() {
                    if (on) {
                        getActivity().getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
                    } else {
                        getActivity().getWindow().clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
                    }
                }
            });
        } catch (Exception ignored) {
            // স্ক্রিন জাগিয়ে রাখা না গেলেও মাপ চলবে
        }
    }

    @Override
    public void onSensorChanged(SensorEvent e) {
        double ts = e.timestamp / 1.0e9;
        int type = e.sensor.getType();
        if (type == Sensor.TYPE_ACCELEROMETER) {
            if (na < CAP) {
                t[na] = ts;
                ax[na] = e.values[0];
                ay[na] = e.values[1];
                az[na] = e.values[2];
                na++;
            }
        } else if (type == Sensor.TYPE_PRESSURE) {
            if (np < CAP) {
                pt[np] = ts;
                p[np] = e.values[0];
                np++;
            }
        }
        long now = SystemClock.elapsedRealtime();
        if (na >= 20 || na >= CAP - 1 || np >= CAP - 1 || (now - lastFlush) >= 100) {
            flush();
        }
    }

    @Override
    public void onAccuracyChanged(Sensor sensor, int accuracy) {
        // দরকার নেই
    }

    // শুধু bg thread থেকে ডাকা হয়
    private void flush() {
        if (na == 0 && np == 0) {
            return;
        }
        final JSObject out = new JSObject();
        JSArray jt = new JSArray();
        JSArray jx = new JSArray();
        JSArray jy = new JSArray();
        JSArray jz = new JSArray();
        JSArray jpt = new JSArray();
        JSArray jp = new JSArray();
        for (int i = 0; i < na; i++) {
            jt.put(Double.valueOf(t[i]));
            jx.put(Double.valueOf(ax[i]));
            jy.put(Double.valueOf(ay[i]));
            jz.put(Double.valueOf(az[i]));
        }
        for (int i = 0; i < np; i++) {
            jpt.put(Double.valueOf(pt[i]));
            jp.put(Double.valueOf(p[i]));
        }
        out.put("t", jt);
        out.put("ax", jx);
        out.put("ay", jy);
        out.put("az", jz);
        out.put("pt", jpt);
        out.put("p", jp);
        na = 0;
        np = 0;
        lastFlush = SystemClock.elapsedRealtime();
        main.post(new Runnable() {
            @Override
            public void run() {
                notifyListeners("batch", out);
            }
        });
    }

    @Override
    protected void handleOnDestroy() {
        stopInternal();
    }
}
