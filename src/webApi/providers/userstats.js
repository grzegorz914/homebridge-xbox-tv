const BaseProvider = require('./base.js')

module.exports = (client) => {
    const provider = new BaseProvider(client)
    provider.endpoint = 'https://userstats.xboxlive.com'
    provider.headers['x-xbl-contract-version'] = 2
    
    provider.getUserTitleStats = (titleId) => {
        return provider.post(
            '/batch',
            `{"arrangebyfield":"xuid","xuids":["${client.authentication.user.xid}"],"groups":[{"name":"Hero","titleId":"${titleId}"}],"stats":[{"name":"MinutesPlayed","titleId":"${titleId}"}]}`
        )
    }

    return provider
}