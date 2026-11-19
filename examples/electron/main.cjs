const { app, BrowserWindow } = require('electron')
const path = require('node:path')

function createWindow() {
  const win = new BrowserWindow({
    width: 320,
    height: 420,
    transparent: true,
    frame: false,
    alwaysOnTop: true,
    hasShadow: false,
    resizable: false,
    webPreferences: { contextIsolation: true },
  })
  win.loadFile(path.join(__dirname, 'renderer.html'))
}

app.whenReady().then(createWindow)
app.on('window-all-closed', () => app.quit())
