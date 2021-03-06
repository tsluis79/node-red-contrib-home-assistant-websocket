const bonjour = require('bonjour')();
const flatten = require('flat');
const selectn = require('selectn');
const uniq = require('lodash.uniq');

let getNode;
let errorMessage;

function disableCache(req, res, next) {
    const node = getNode(req.params.id);

    if (selectn('config.cacheJson', node) === false) {
        res.setHeader('Surrogate-Control', 'no-store');
        res.setHeader(
            'Cache-Control',
            'no-store, no-cache, must-revalidate, proxy-revalidate'
        );
        res.setHeader('Pragma', 'no-cache');
        res.setHeader('Expires', '0');
    }

    next();
}

function getEntities(req, res, next) {
    const homeAssistant = getHomeAssistant(req.params.id);
    if (!homeAssistant) {
        return res.status(503).send({ error: errorMessage });
    }

    const states = homeAssistant.getEntities();
    res.json(states);
}

function getStates(req, res, next) {
    const homeAssistant = getHomeAssistant(req.params.id);
    if (!homeAssistant) {
        return res.status(503).send({ error: errorMessage });
    }

    const states = homeAssistant.getStates();
    res.json(states);
}

function getServices(req, res, next) {
    const homeAssistant = getHomeAssistant(req.params.id);
    if (!homeAssistant) {
        return res.status(503).send({ error: errorMessage });
    }

    const services = homeAssistant.getServices();
    res.json(services);
}

function getProperties(req, res, next) {
    const homeAssistant = getHomeAssistant(req.params.id);
    if (!homeAssistant) {
        return res.status(503).send({ error: errorMessage });
    }

    let flat = [];
    let singleEntity = !!req.query.entityId;

    let states = homeAssistant.getStates(req.query.entityId);

    if (!states) {
        states = homeAssistant.getStates();
        singleEntity = false;
    }

    if (singleEntity) {
        flat = Object.keys(flatten(states)).filter(
            (e) => e.indexOf(req.query.term) !== -1
        );
    } else {
        flat = Object.values(states).map((entity) =>
            Object.keys(flatten(entity))
        );
    }

    const uniqArray = uniq(
        [].concat(...flat).sort((a, b) => {
            if (!a.includes('.') && b.includes('.')) return -1;
            if (a.includes('.') && !b.includes('.')) return 1;
            if (a < b) return -1;
            if (a > b) return 1;

            return 0;
        })
    );

    res.json(uniqArray);
}

async function getTags(req, res) {
    const homeAssistant = getHomeAssistant(req.params.id);
    if (!homeAssistant) {
        return res.status(503).send({ error: errorMessage });
    }

    if (req.query.update) {
        await homeAssistant.updateTags();
    }

    const tags = homeAssistant.getTags().map((t) => {
        return {
            id: t.tag_id,
            name: t.name,
        };
    });

    res.json(tags);
}

function getIntegrationVersion(req, res, next) {
    const client = getHomeAssistant(req.params.id);
    const data = { version: client ? client.integrationVersion : 0 };

    res.json(data);
}

function getHomeAssistant(nodeId) {
    const node = getNode(nodeId);
    return selectn('controller.homeAssistant', node);
}

function createRoutes(RED) {
    getNode = RED.nodes.getNode;
    errorMessage = RED._('config-server.errors.no_server_selected');

    const endpoints = {
        entities: getEntities,
        properties: getProperties,
        services: getServices,
        states: getStates,
        tags: getTags,
    };
    Object.entries(endpoints).forEach(([key, value]) =>
        RED.httpAdmin.get(
            `/homeassistant/${key}/:id?`,
            RED.auth.needsPermission('server.read'),
            disableCache.bind(this),
            value.bind(this)
        )
    );

    RED.httpAdmin.get(
        `/homeassistant/version/:id`,
        RED.auth.needsPermission('server.read'),
        getIntegrationVersion.bind(this)
    );

    RED.httpAdmin.get('/homeassistant/discover', function (req, res) {
        const instances = [];
        const browser = bonjour.find({ type: 'home-assistant' }, (service) => {
            instances.push({
                label: service.name
                    ? `${service.name} (${service.txt.base_url})`
                    : service.txt.base_url,
                value: service.txt.base_url,
            });
        });

        // Add a bit of delay for all services to be discovered
        setTimeout(() => {
            res.json(instances);
            browser.stop();
        }, 3000);
    });
}

module.exports = {
    createRoutes,
};
