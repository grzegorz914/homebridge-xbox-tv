const QueryString = require('querystring')
const BaseProvider = require('./base.js')

module.exports = (client) => {
    const provider = new BaseProvider(client)
    provider.endpoint = 'https://gameclipsmetadata.xboxlive.com'
    provider.headers['x-xbl-contract-version'] = '1'

    provider.getUserGameclips = () => {
        return provider.get('/users/me/clips')
    }

    provider.getCommunityGameclipsByTitleId = (titleId) => {
        return provider.get('/public/titles/' + titleId + '/clips/saved?qualifier=created')
    }

    provider.getGameclipsByXuid = (xuid, titleId, skipItems, maxItems) => {
        const params = {
            skipitems: skipItems || 0,
            maxitems: maxItems || 25,
        }

        if (titleId !== undefined) {
            params.titleid = titleId
        }

        const queryParams = QueryString.stringify(params)
        return provider.get('/users/xuid(' + xuid + ')/clips?' + queryParams)
    }

    return provider
}