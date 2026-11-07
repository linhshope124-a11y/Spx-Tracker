package com.linhshope.spxtracker;

import android.os.Bundle;
import android.webkit.WebView;

import androidx.activity.OnBackPressedCallback;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        getOnBackPressedDispatcher().addCallback(this, new OnBackPressedCallback(true) {
            @Override
            public void handleOnBackPressed() {
                final WebView webView = getBridge() != null ? getBridge().getWebView() : null;
                if (webView == null) {
                    finish();
                    return;
                }
                // 1) Cho JS đóng popup trên cùng trước
                webView.evaluateJavascript(
                    "(function(){try{return !!(window.__spxBack&&window.__spxBack());}catch(e){return false;}})()",
                    value -> {
                        if ("true".equals(value)) return;
                        // 2) Còn trang trước (vd Chính sách bảo mật → app) thì lùi
                        if (webView.canGoBack()) {
                            webView.goBack();
                        } else {
                            // 3) Hết đường lùi → thoát app
                            setEnabled(false);
                            getOnBackPressedDispatcher().onBackPressed();
                            setEnabled(true);
                        }
                    });
            }
        });
    }
}
