const BaseProvider = require('./base.js')

module.exports = (client) => {
    const provider = new BaseProvider(client)
    provider.endpoint = 'https://social.xboxlive.com'
    provider.getFriends = () => {
        return provider.get('/users/me/summary')
    }

    return provider
}