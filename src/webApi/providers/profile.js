const BaseProvider = require('./base.js')

module.exports = (client) => {
    const provider = new BaseProvider(client)
    provider.endpoint = 'https://profile.xboxlive.com'
    provider.headers['x-xbl-contract-version'] = 3

    provider.getUserProfile = () => {
        return provider.get('/users/xuid(' + client.authentication.user.xid + ')/profile/settings?settings=GameDisplayName,GameDisplayPicRaw,Gamerscore,Gamertag')
    }

    return provider
}