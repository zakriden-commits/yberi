package com.sasny.nurmadof;

import android.app.Activity;
import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.graphics.Color;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.view.View;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Toast;

public final class MainActivity extends Activity {
    private static final int PHOTO_PICKER_REQUEST = 42;

    private WebView webView;
    private ValueCallback<Uri[]> pendingPhotoCallback;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        getWindow().setStatusBarColor(Color.rgb(16, 17, 25));
        getWindow().setNavigationBarColor(Color.rgb(16, 17, 25));
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            getWindow().setNavigationBarContrastEnforced(false);
        }

        webView = new WebView(this);
        webView.setBackgroundColor(Color.rgb(16, 17, 25));
        webView.setOverScrollMode(View.OVER_SCROLL_NEVER);

        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setAllowFileAccess(true);
        settings.setAllowContentAccess(true);
        settings.setSupportZoom(false);
        settings.setBuiltInZoomControls(false);
        settings.setDisplayZoomControls(false);
        settings.setJavaScriptCanOpenWindowsAutomatically(false);

        webView.setWebViewClient(new WebViewClient());
        webView.setWebChromeClient(new WebChromeClient() {
            @Override
            public boolean onShowFileChooser(
                    WebView view,
                    ValueCallback<Uri[]> filePathCallback,
                    FileChooserParams fileChooserParams
            ) {
                if (pendingPhotoCallback != null) {
                    pendingPhotoCallback.onReceiveValue(null);
                }
                pendingPhotoCallback = filePathCallback;
                try {
                    Intent pickerIntent = fileChooserParams.createIntent();
                    startActivityForResult(pickerIntent, PHOTO_PICKER_REQUEST);
                } catch (ActivityNotFoundException exception) {
                    pendingPhotoCallback = null;
                    filePathCallback.onReceiveValue(null);
                    Toast.makeText(MainActivity.this, "Не удалось открыть выбор фото", Toast.LENGTH_SHORT).show();
                }
                return true;
            }
        });

        setContentView(webView);
        webView.loadUrl("file:///android_asset/www/index.html");
    }

    @Override
    @SuppressWarnings("deprecation")
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        if (requestCode == PHOTO_PICKER_REQUEST) {
            if (pendingPhotoCallback != null) {
                Uri[] results = resultCode == RESULT_OK
                        ? WebChromeClient.FileChooserParams.parseResult(resultCode, data)
                        : null;
                pendingPhotoCallback.onReceiveValue(results);
                pendingPhotoCallback = null;
            }
            return;
        }
        super.onActivityResult(requestCode, resultCode, data);
    }

    @Override
    protected void onDestroy() {
        if (pendingPhotoCallback != null) {
            pendingPhotoCallback.onReceiveValue(null);
            pendingPhotoCallback = null;
        }
        if (webView != null) {
            webView.destroy();
            webView = null;
        }
        super.onDestroy();
    }
}
