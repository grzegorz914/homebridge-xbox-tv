const QueryString = require('querystring')
const BaseProvider = require('./base.js')

module.exports = (client) => {
    const provider = new BaseProvider(client)
    provider.endpoint = 'https://screenshotsmetadata.xboxlive.com'
    provider.headers['x-xbl-contract-version'] = '5'
    
    provider.getUserScreenshots = () => {
        return provider.get('/users/me/screenshots')
        // return this.get('/users/me/scids/d1adc8aa-0a31-4407-90f2-7e9b54b0347c/screenshots/06e5ed92-8508-4a7f-9ba0-94fb945ec20e/views')

    }

    provider.getCommunityScreenshotsByTitleId = (titleId) => {
        return provider.get('/public/titles/' + titleId + '/screenshots?qualifier=created&maxItems=10')
    }

    provider.getScreenshotsByXuid = (xuid, titleId, skipItems, maxItems) => {
        const params = {
            skipitems: skipItems || 0,
            maxitems: maxItems || 25,
        }

        if (titleId !== undefined) {
            params.titleid = titleId
        }

        const queryParams = QueryString.stringify(params)

        return provider.get('/users/xuid(' + xuid + ')/screenshots?' + queryParams)
    }

    return provider
}