const BaseProvider = require('./base.js')

module.exports = (client) => {
    const provider = new BaseProvider(client)
    provider.endpoint = 'https://titlehub.xboxlive.com'
    provider.getTitleHistory = () => {
        const params = [
            'achievement',
            'image',
            'scid',
        ]

        return provider.get('/users/xuid(' + client.authentication.user.xid + ')/titles/titlehistory/decoration/' + params.join(','))
    }

    provider.getTitleId = (titleId) => {
        const params = [
            'achievement',
            'image',
            'detail',
            'scid',
            'alternateTitleId'
        ]

        return provider.get('/users/xuid(' + client.authentication.user.xid + ')/titles/titleid(' + titleId + ')/decoration/' + params.join(','))
    }

    return provider
}