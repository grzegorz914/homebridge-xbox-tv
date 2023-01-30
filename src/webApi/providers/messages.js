const BaseProvider = require('./base.js')

module.exports = (client) => {
    const provider = new BaseProvider(client)
    provider.endpoint = 'https://xblmessaging.xboxlive.com'

    provider.getInbox = () => {
        return provider.get('/network/Xbox/users/me/inbox')

    }

    provider.getConversation = (xuid) => {
        return provider.get('/network/Xbox/users/me/conversations/users/xuid(' + xuid + ')?maxItems=100')
    }

    return provider
}