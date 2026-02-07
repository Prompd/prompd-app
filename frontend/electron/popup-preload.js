/**
 * Popup Preload - Minimal IPC bridge for the user input popup window
 *
 * Exposes only what the popup needs: fetch request data, submit response, cancel.
 */

const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('popupAPI', {
  getRequestData: () => ipcRenderer.invoke('popup:getRequestData'),
  submitInput: (response) => ipcRenderer.invoke('popup:submitInput', response),
  cancel: () => ipcRenderer.invoke('popup:cancel')
})
