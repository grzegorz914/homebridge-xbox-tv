const BaseProvider = require('./base.js')

module.exports = (client) => {
    const provider = new BaseProvider(client)
    provider.endpoint = 'https://peoplehub.xboxlive.com'
    provider.headers['x-xbl-contract-version'] = 3
    provider.headers['Accept-Language'] = 'en-US'

    provider.getFriends = () => {
        const params = [
            'preferredcolor',
            'detail',
            'multiplayersummary',
            'presencedetail',
        ]

        return provider.get('/users/me/people/social/decoration/' + params.join(','))
    }

    provider.recentPlayers = () => {
        return provider.get('/users/me/people/recentplayers')
    }

    return provider
}