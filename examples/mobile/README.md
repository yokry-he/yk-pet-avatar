# 移动端 WebView

yk-pet-avatar 跑在普通网页里，所以 uni-app、React Native、Tauri 都用系统 WebView 装载同一页。

宿主向页面发命令，页面再调用 `<yk-pet>`：

```html
<yk-pet id="pet" preference="2d"></yk-pet>
<script type="module">
  const pet = document.querySelector('#pet')
  window.addEventListener('message', (event) => {
    const data = typeof event.data === 'string' ? JSON.parse(event.data) : event.data
    if (!data || data.type !== 'yk-pet') return
    if (data.method === 'say') pet.say(data.text, data.opts)
    if (data.method === 'play') pet.play(data.action)
    if (data.method === 'setEmotion') pet.setEmotion(data.emotion)
    if (data.method === 'setState') pet.setState(data.state)
  })
</script>
```

React Native：

```tsx
<WebView
  source={{ uri: 'https://example.com/pet.html' }}
  onLoad={() => webRef.current?.postMessage(JSON.stringify({ type: 'yk-pet', method: 'say', text: '到啦' }))}
/>
```

uni-app 使用 `<web-view src="...">`，由页面里的同一段 `message` 监听接收。3D 需要 WebGL；低端设备把 `preference` 设为 `2d`，或保持 `auto` 让组件自己降级。
