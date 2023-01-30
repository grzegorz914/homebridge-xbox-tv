'use strict';
const BaseProvider = require('./base.js')
const Uuid4 = require('uuid4')

module.exports = (client) => {
    const provider = new BaseProvider(client, 'smartglass')
    provider.endpoint = 'https://xccs.xboxlive.com'
    provider.headers['x-xbl-contract-version'] = 4
    provider.headers['skillplatform'] = 'RemoteManagement'

    provider.getConsolesList = () => {
        return provider.get('/lists/devices?queryCurrentDevice=false&includeStorageDevices=true')
    }

    provider.getInstalledApps = (consoleId) => {
        return provider.get('/lists/installedApps?deviceId=' + consoleId)
    }

    provider.getStorageDevices = (consoleId) => {
        return provider.get('/lists/storageDevices?deviceId=' + consoleId)
    }

    provider.getConsoleStatus = (consoleId) => {
        return provider.get('/consoles/' + consoleId)
    }

    provider.powerOn = (consoleId) => {
        return this.sendCommand(consoleId, 'Power', 'WakeUp')
    }

    provider.powerOff = (consoleId) => {
        return this.sendCommand(consoleId, 'Power', 'TurnOff')
    }

    provider.reboot = (consoleId) => {
        return this.sendCommand(consoleId, 'Power', 'Reboot')
    }

    provider.mute = (consoleId) => {
        return this.sendCommand(consoleId, 'Audio', 'Mute')
    }

    provider.unmute = (consoleId) => {
        return this.sendCommand(consoleId, 'Audio', 'Unmute')
    }

    provider.launchDashboard = (consoleId) => {
        return this.sendCommand(consoleId, 'Shell', 'GoHome')
    }

    provider.launchOneGuide = (consoleId) => {
        return this.sendCommand(consoleId, 'TV', 'ShowGuide')
    }

    provider.launchApp = (consoleId, oneStoreProductId) => {
        return this.sendCommand(consoleId, 'Shell', 'ActivateApplicationWithOneStoreProductId', [{
            'oneStoreProductId': oneStoreProductId
        }])
    }

    provider.sendButtonPress = (consoleId, button) => {
        return this.sendCommand(consoleId, 'Shell', 'InjectKey', [{
            'keyType': button
        }])
    }

    provider.openGuideTab = (consoleId) => {
        return this.sendCommand(consoleId, 'Shell', 'ShowGuideTab', [{
            'tabName': 'Guide'
        }])
    }

    this.sendCommand = (consoleId, commandType, command, params) => {
        if (params == undefined) {
            params = []
        }

        const sessionid = Uuid4()
        const postParams = {
            "destination": "Xbox",
            "type": commandType,
            "command": command,
            "sessionId": sessionid,
            "sourceId": "com.microsoft.smartglass",
            "parameters": params,
            "linkedXboxId": consoleId,
        }

        const postData = JSON.stringify(postParams)
        return provider.post('/commands', postData)
    }

    return provider
}