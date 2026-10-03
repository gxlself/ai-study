package com.sprout.growth;

import android.os.Bundle;
import android.view.KeyEvent;
import android.webkit.WebView;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;
import androidx.core.view.WindowInsetsControllerCompat;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(SproutScreenPlugin.class);
        super.onCreate(savedInstanceState);
        focusWebView();
    }

    @Override
    public void onResume() {
        super.onResume();
        focusWebView();
        WindowInsetsControllerCompat controller =
            WindowCompat.getInsetsController(getWindow(), getWindow().getDecorView());
        controller.hide(WindowInsetsCompat.Type.systemBars());
        controller.setSystemBarsBehavior(
            WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE
        );
    }

    private void focusWebView() {
        if (getBridge() == null) return;
        WebView webView = getBridge().getWebView();
        webView.setFocusable(true);
        webView.setFocusableInTouchMode(true);
        if (!webView.hasFocus()) webView.requestFocus();
    }

    @Override
    public boolean dispatchKeyEvent(KeyEvent event) {
        if (event.getKeyCode() == KeyEvent.KEYCODE_DPAD_CENTER && getBridge() != null) {
            // 电视确认键统一为 Enter，保留按下/抬起与长按信息，不额外触发 click。
            KeyEvent enter = new KeyEvent(
                event.getDownTime(), event.getEventTime(), event.getAction(),
                KeyEvent.KEYCODE_ENTER, event.getRepeatCount(), event.getMetaState(),
                event.getDeviceId(), event.getScanCode(), event.getFlags(), event.getSource()
            );
            return getBridge().getWebView().dispatchKeyEvent(enter);
        }
        // 返回键保留 Capacitor App 插件处理，避免绕过网页家长门。
        return super.dispatchKeyEvent(event);
    }
}
