# PWA — Инструкция по установке

## Файлы для загрузки в GitHub

Положите эти файлы в папку `public/`:

```
public/
├── manifest.json    ← ЗАМЕНИТЬ существующий
├── sw.js            ← НОВЫЙ файл
├── icon-192.png     ← НОВЫЙ файл
├── icon-512.png     ← НОВЫЙ файл
```

## Изменения в public/index.html

Добавьте эти строки в `<head>`:

```html
<link rel="manifest" href="%PUBLIC_URL%/manifest.json" />
<meta name="theme-color" content="#0d0b1a" />
<meta name="apple-mobile-web-app-capable" content="yes" />
<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
<meta name="apple-mobile-web-app-title" content="Наргилия" />
<link rel="apple-touch-icon" href="%PUBLIC_URL%/icon-192.png" />
```

Добавьте перед закрывающим `</body>`:

```html
<script>
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('/sw.js');
    });
  }
</script>
```

## Результат

После деплоя:
- На Android: появится баннер "Добавить на главный экран"
- На iOS: Safari → Поделиться → "На экран Домой"
- Приложение откроется без адресной строки, как обычное приложение
- Базовый офлайн-режим (показывает кэшированную версию)
