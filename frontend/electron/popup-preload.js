/**
 * Popup Preload - Minimal IPC bridge for the user input popup window
 *
 * Exposes: fetch request data, submit response, cancel,
 * plus listeners for follow-up requests and workflow completion.
 */

const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('popupAPI', {
  getRequestData: () => ipcRenderer.invoke('popup:getRequestData'),
  submitInput: (response) => ipcRenderer.invoke('popup:submitInput', response),
  cancel: () => ipcRenderer.invoke('popup:cancel'),

  // Main process pushes a new request into the same popup window
  onNewRequest: (callback) => {
    ipcRenderer.on('popup:newRequest', (_event, data) => callback(data))
  },

  // Main process signals that the workflow execution finished
  onDone: (callback) => {
    ipcRenderer.on('popup:done', (_event, data) => callback(data))
  }
})
