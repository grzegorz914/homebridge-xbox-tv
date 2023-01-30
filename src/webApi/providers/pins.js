const BaseProvider = require('./base.js')

module.exports = (client) => {
    const provider = new BaseProvider(client)
    provider.endpoint = 'https://eplists.xboxlive.com'
    provider.headers['Content-Type'] = 'application/json'

    provider.getPins = (list = 'XBLPins') => {
        return provider.get('/users/xuid(' + client.authentication.user.xid + ')/lists/PINS/' + list)
    }

    provider.getSaveForLater = () => {
        return provider.get('/users/xuid(' + client.authentication.user.xid + ')/lists/PINS/SaveForLater')
    }

    return provider
}