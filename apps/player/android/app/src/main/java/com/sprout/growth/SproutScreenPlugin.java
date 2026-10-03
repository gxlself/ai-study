package com.sprout.growth;

import android.view.WindowManager;
import android.webkit.WebView;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.WebViewListener;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.IOException;
import java.io.InputStream;
import java.io.ByteArrayOutputStream;
import java.nio.charset.StandardCharsets;

@CapacitorPlugin(name = "SproutScreen")
public class SproutScreenPlugin extends Plugin {
    private boolean active;
    private WebViewListener listener;

    @Override
    public void load() {
        String script;
        try (InputStream stream = getContext().getAssets().open("sprout-native-runtime.js")) {
            ByteArrayOutputStream bytes = new ByteArrayOutputStream();
            byte[] buffer = new byte[4096];
            int count;
            while ((count = stream.read(buffer)) != -1) bytes.write(buffer, 0, count);
            script = bytes.toString(StandardCharsets.UTF_8.name());
        } catch (IOException error) {
            throw new IllegalStateException("Missing Sprout native runtime", error);
        }
        final String runtime = script;
        listener = new WebViewListener() {
            @Override
            public void onPageLoaded(WebView webView) {
                webView.evaluateJavascript(runtime, null);
            }

            @Override
            public void onPageStarted(WebView webView) {
                setScreenAwake(false);
            }
        };
        bridge.addWebViewListener(listener);
    }

    @PluginMethod
    public void setAwake(PluginCall call) {
        Boolean awake = call.getBoolean("awake");
        if (awake == null) {
            call.reject("awake must be a boolean");
            return;
        }
        getActivity().runOnUiThread(() -> {
            setScreenAwake(awake && active);
            call.resolve();
        });
    }

    private void setScreenAwake(boolean awake) {
        if (awake) getActivity().getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        else getActivity().getWindow().clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
    }

    @Override
    protected void handleOnResume() {
        active = true;
        bridge.eval("window.dispatchEvent(new Event('sprout:native-resume'));", null);
    }

    @Override
    protected void handleOnPause() {
        active = false;
        setScreenAwake(false);
    }

    @Override
    protected void handleOnDestroy() {
        active = false;
        setScreenAwake(false);
        if (listener != null) bridge.removeWebViewListener(listener);
    }
}
