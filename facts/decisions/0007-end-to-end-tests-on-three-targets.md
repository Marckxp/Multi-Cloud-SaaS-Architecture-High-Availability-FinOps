# 0007 · End-to-end on three targets: Web, Windows and Android

- **Status:** accepted
- **Context:** the same Razor UI runs in the browser and in native WebViews, with layout and platform differences.
- **Decision:** Playwright on the web at three widths; on the Windows app, through the WebView2 CDP, with a dedicated data folder; on a real Android device over USB, a layout audit (scrolling, off-screen elements, touch targets below 40 px), always with a data backup first.
- **Consequences:** one set of specs covers three targets. Running one width and one target at a time fits on a machine with little memory.
