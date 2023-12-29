// All of the Node.js APIs are available in the preload process.
// It has the same sandbox as a Chrome extension.

const electron = require('electron');

const { contextBridge, ipcRenderer } = require('electron')
contextBridge.exposeInMainWorld('electronAPI', {
  sendSync: (channel,args) => ipcRenderer.sendSync(channel,args),
  send: (channel,args) => ipcRenderer.send(channel,args),
  on: (channel,callback) => ipcRenderer.on(channel,callback),
})

window.addEventListener('DOMContentLoaded', () => {
  const replaceText = (selector, text) => {
    const element = document.getElementById(selector)
    if (element) element.innerText = text
  }

  for (const type of ['chrome', 'node', 'electron']) {
    replaceText(`${type}-version`, process.versions[type])
  }
})

process.once('loaded', () => {
  global.ipcRenderer = electron.ipcRenderer;
  global.openExternal = electron.shell.openExternal;
});
