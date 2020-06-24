'use strict'
const path = require('path')
const { app, Menu, shell } = require('electron')
const {
  is,
  appMenu,
  aboutMenuItem,
  openUrlMenuItem,
  openNewGitHubIssue,
  debugInfo
} = require('electron-util')

const helpSubmenu = [
  openUrlMenuItem({
    label: 'Website',
    url: 'https://github.com/hr/spacedrop'
  }),
  openUrlMenuItem({
    label: 'Source Code',
    url: 'https://github.com/hr/spacedrop'
  }),
  {
    label: 'Report an Issue…',
    click () {
      const body = `
<!-- Please succinctly describe your issue and steps to reproduce it. -->


---

${debugInfo()}`

      openNewGitHubIssue({
        user: 'hr',
        repo: 'spacedrop',
        body
      })
    }
  }
]

if (!is.macos) {
  helpSubmenu.push(
    {
      type: 'separator'
    },
    aboutMenuItem({
      icon: path.join(__dirname, 'build', 'icon.png'),
      text: 'Created by Habib Rehman'
    })
  )
}

const debugSubmenu = [
  {
    label: 'Show App Data',
    click () {
      shell.openItem(app.getPath('userData'))
    }
  },
  {
    type: 'separator'
  },
  {
    label: 'Delete Drops',
    click () {
      app.emit('delete-drops')
    }
  },
  {
    label: 'Delete App Data',
    click () {
      shell.moveItemToTrash(app.getPath('userData'))
      app.relaunch()
      app.quit()
    }
  }
]

const defaultTemplate = [
  {
    role: 'fileMenu',
    submenu: [
      {
        label: 'New Wormhole',
        click () {
          app.emit('create-wormhole')
        }
      },
      {
        label: 'Send File...',
        click () {
          app.emit('render-event', 'create-drop')
        }
      },
      {
        label: 'Copy Spacedrop ID',
        click () {
          app.emit('render-event', 'copy-id')
        }
      },
      {
        type: 'separator'
      },
      {
        role: 'close'
      }
    ]
  },
  {
    role: 'editMenu'
  },
  {
    role: 'viewMenu'
  },
  {
    role: 'windowMenu'
  },
  {
    role: 'help',
    submenu: helpSubmenu
  }
]

const macosTemplate = [appMenu(), ...defaultTemplate]

const template = process.platform === 'darwin' ? macosTemplate : defaultTemplate

if (is.development) {
  template.push({
    label: 'Debug',
    submenu: debugSubmenu
  })
}

module.exports = Menu.buildFromTemplate(template)
