const QueryString = require('querystring')
const BaseProvider = require('./base.js')

module.exports = (client) => {
    const provider = new BaseProvider(client)
    provider.endpoint = 'https://displaycatalog.mp.microsoft.com'
    provider.headers = {
        'MS-CV': '0'
    }

    provider.searchTitle = (query, marketLocale = 'us', languagesLocale = 'en-us') => {
        const searchParams = {
            "languages": languagesLocale,
            "market": marketLocale,
            "platformdependencyname": 'windows.xbox',
            "productFamilyNames": "Games,Apps",
            "query": query,
            "topProducts": 25,
        }

        const queryParams = QueryString.stringify(searchParams)
        return provider.get('/v7.0/productFamilies/autosuggest?' + queryParams)
    }

    provider.getProductId = (query, marketLocale = 'us', languagesLocale = 'en-us') => {
        const searchParams = {
            "actionFilter": 'Browse',
            "bigIds": [query],
            "fieldsTemplate": 'details',
            "languages": languagesLocale,
            "market": marketLocale,
        }

        const queryParams = QueryString.stringify(searchParams)
        return provider.get('/v7.0/products?' + queryParams)
    }

    provider.getProductFromAlternateId = (titleId, titleType, marketLocale = 'US', languagesLocale = 'en-US') => {
        const searchParams = {
            "top": 25,
            "alternateId": titleType,
            "fieldsTemplate": 'details',
            // "languages": 'en-US',
            // "market": 'US',
            "languages": languagesLocale,
            "market": marketLocale,
            "value": titleId,
        }

        const queryParams = QueryString.stringify(searchParams)
        return provider.get('/v7.0/products/lookup?' + queryParams)
    }

    return provider
}
