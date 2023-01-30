const BaseProvider = require('./base.js')

module.exports = (client) => {
    const provider = new BaseProvider(client)
    provider.endpoint = 'https://achievements.xboxlive.com'
    provider.headers['x-xbl-contract-version'] = 2

    provider.getTitleAchievements = (continuationToken = 0) => {
        return provider.get('/users/xuid(' + client.authentication.user.xid + ')/history/titles?continuationToken=' + continuationToken)
    }

    provider.getTitleAchievements360 = (continuationToken = 0) => {
        provider.headers['x-xbl-contract-version'] = 1
        return provider.get('/users/xuid(' + client.authentication.user.xid + ')/history/titles')
    }

    provider.getTitleId = (titleId, continuationToken = 0) => {
        return provider.get('/users/xuid(' + client.authentication.user.xid + ')/achievements?titleId=' + titleId + '&continuationToken=' + continuationToken)
    }

    provider.getTitleId360 = (titleId, continuationToken = 0) => {
        provider.headers['x-xbl-contract-version'] = 1
        return provider.get('/users/xuid(' + client.authentication.user.xid + ')/achievements?titleId=' + titleId + '&continuationToken=' + continuationToken)
    }

    return provider
}