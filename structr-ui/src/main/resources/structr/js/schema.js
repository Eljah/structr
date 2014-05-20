/*
 *  Copyright (C) 2010-2014 Morgner UG (haftungsbeschränkt)
 *
 *  This file is part of structr <http://structr.org>.
 *
 *  structr is free software: you can redistribute it and/or modify
 *  it under the terms of the GNU Affero General Public License as
 *  published by the Free Software Foundation, either version 3 of the
 *  License, or (at your option) any later version.
 *
 *  structr is distributed in the hope that it will be useful,
 *  but WITHOUT ANY WARRANTY; without even the implied warranty of
 *  MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 *  GNU General Public License for more details.
 *
 *  You should have received a copy of the GNU Affero General Public License
 *  along with structr.  If not, see <http://www.gnu.org/licenses/>.
 */
var canvas, instance, res, nodes = [], rels = [], localStorageSuffix = '_schema_' + port, undefinedRelType = 'UNDEFINED_RELATIONSHIP_TYPE', initialRelType = undefinedRelType;
var radius = 20, stub = 30, offset = 0, maxZ = 0;

$(document).ready(function() {
    Structr.registerModule('schema', _Schema);
    Structr.classes.push('schema');
});

var _Schema = {
    type_icon: 'icon/database_table.png',
    schemaLoading: false,
    schemaLoaded: false,
    reload: function() {
        _Schema.storePositions();
        main.empty();
        _Schema.init();
        _Schema.resize();
    },
    storePositions: function() {
        $.each($('#schema-graph .node'), function(i, n) {
            var node = $(n);
            var id = node.attr('id');
            var obj = JSON.parse(localStorage.getItem(id + localStorageSuffix + 'node-position')) || {};
            obj.position = node.position();
            localStorage.setItem(id + localStorageSuffix + 'node-position', JSON.stringify(obj));
        });
    },
    storeMode: function(id, mode) {
        var obj = JSON.parse(localStorage.getItem(id + localStorageSuffix + 'node-position')) || {};
        obj.mode = mode;
        localStorage.setItem(id + localStorageSuffix + 'node-position', JSON.stringify(obj));
    },
    getPosition: function(id) {
        var n = JSON.parse(localStorage.getItem(id + localStorageSuffix + 'node-position'));
        return n ? n.position : undefined;
    },
    getMode: function(id) {
        var n = JSON.parse(localStorage.getItem(id + localStorageSuffix + 'node-position'));
        return n ? n.mode : 'compact';
    },
    init: function() {

        _Schema.schemaLoading = false;
        _Schema.schemaLoaded = false;
        _Schema.schema = [];
        _Schema.keys = [];

        main.append('<div class="schema-input-container"><input class="schema-input" id="type-name" type="text" size="20" placeholder="New type"><button id="create-type" class="btn"><img src="icon/add.png"> Add Type</button></div>');

        if (true) {
            $('.schema-input-container').append('<input class="schema-input" id="ggist-url" type="text" size="30" placeholder="Enter a GraphGist raw URL"><button id="gg-import" class="btn">Start Import</button>');
            $('#gg-import').on('click', function(e) {
                var btn = $(this);
                var text = btn.text();
                btn.attr('disabled', 'disabled').addClass('disabled').html(text + ' <img src="img/al.gif">');
                e.preventDefault();
                _Schema.importGraphGist($('#ggist-url').val(), text);
            });

            $('.schema-input-container').append('<button class="btn" id="admin-tools"><img src="icon/wrench.png"> Admin Tools</button>');
            $('#admin-tools').on('click', function() {
                _Schema.openAdminTools();
            });
        }

        $('#type-name').focus().on('keyup', function(e) {

            if (e.keyCode === 13) {
                e.preventDefault();
                if ($('#type-name').val().length) {
                    $('#create-type').click();
                }
                return false;
            }

        });
        $('#create-type').on('click', function() {
            _Schema.createNode($('#type-name').val());
        });

        jsPlumb.ready(function() {
            main.append('<div class="canvas" id="schema-graph"></div>');

            canvas = $('#schema-graph');
            _Schema.resize();

            instance = jsPlumb.getInstance({
                //Connector: "StateMachine",
                PaintStyle: {
                    lineWidth: 5,
                    strokeStyle: "#81ce25"
                },
                Endpoint: ["Dot", {radius: 6}],
                EndpointStyle: {
                    fillStyle: "#aaa"
                },
                Container: "schema-graph",
                ConnectionOverlays: [
                    ["PlainArrow", {
                            location: 1,
                            width: 15,
                            length: 12
                        }
                    ]
                ]
            });

            _Schema.loadSchema(function() {
                instance.bind('connection', function(info) {
                    _Schema.connect(getIdFromIdString(info.sourceId), getIdFromIdString(info.targetId));
                });
                instance.bind('connectionDetached', function(info) {
                    Structr.confirmation('<h3>Delete schema relationship?</h3>',
                            function() {
                                $.unblockUI({
                                    fadeOut: 25
                                });
                                _Schema.detach(info.connection.getParameter('id'));
                                _Schema.reload();
                            });
                    _Schema.reload();


                });
            });
        });

        $(document).keyup(function(e) {
            if (e.keyCode === 27) {
                dialogCancelButton.click();
            }
        });

        $(window).on('resize', function() {
            _Schema.resize();
        });

    },
    onload: function() {
        _Schema.init();
        $('#main-help a').attr('href', 'http://docs.structr.org/frontend-user-guide#Schema');
    },
    /**
     * Read the schema from the _schema REST resource and call 'callback'
     * after the complete schema is loaded.
     */
    loadSchema: function(callback) {
        // Avoid duplicate loading of schema
        if (_Schema.schemaLoading) {
            return;
        }
        _Schema.schemaLoading = true;

        _Schema.loadNodes(function() {
            _Schema.loadRels(callback);
        });

    },
    isSchemaLoaded: function() {
        var all = true;
        if (!_Schema.schemaLoaded) {
            $.each(_Schema.types, function(t, type) {
                all &= (_Schema.schema[type] && _Schema.schema[type] !== null);
            });
        }
        _Schema.schemaLoaded = all;
        return _Schema.schemaLoaded;
    },
    loadNodes: function(callback) {
        var url = rootUrl + 'schema_nodes';
        $.ajax({
            url: url,
            dataType: 'json',
            contentType: 'application/json; charset=utf-8',
            success: function(data) {

                $.each(data.result, function(i, entity) {
                    var id = 'id_' + entity.id;
                    nodes[entity.id] = entity;
                    canvas.append('<div class="schema node compact" id="' + id + '"><b>' + entity.name + '</b>'
                            + '<img class="icon toggle-view" src="icon/arrow_out.png">'
                            + '<img class="icon delete" src="icon/delete.png">'
                            + '<img class="icon edit" src="icon/pencil.png">'
                            + '</div>');

                    var node = $('#' + id);
                    node.children('b').on('click', function() {
                        _Schema.makeNameEditable(node);
                    });

                    node.on('click', function() {
                        node.css({zIndex: ++maxZ});
                    });

                    node.children('.delete').on('click', function() {
                        Structr.confirmation('<h3>Delete schema node?</h3><p>This will delete all incoming and outgoing schema relatinships as well, but no data will be removed.</p>',
                                function() {
                                    $.unblockUI({
                                        fadeOut: 25
                                    });
                                    _Schema.deleteNode(entity.id);
                                });
                    });

                    var storedPosition = _Schema.getPosition(id);
                    node.offset({
                        left: storedPosition ? storedPosition.left : i * 100 + 25,
                        top: storedPosition ? storedPosition.top : i * 40 + 131
                    });

                    $('.toggle-view', node).on('click', function() {
                        _Schema.toggleView(entity.id);
                    });

                    if (_Schema.getMode(entity.id) !== 'compact') {
                        _Schema.expandView(entity.id);
                    }

                    $('.edit', node).on('click', function(e) {
                        e.stopPropagation();
                        Structr.dialog('Edit schema node', function() {
                        }, function() {
                            instance.repaintEverything();
                        });
                        var id = getId($(this).closest('.schema.node'));

                        Command.get(id, function(entity) {
                            _Schema.loadNode(entity, dialogText);
                        });

                        return false;
                    });

                    nodes[entity.id + '_top'] = instance.addEndpoint(id, {
                        //anchor: [ "Perimeter", { shape: "Square" } ],
                        anchor: "Top",
                        maxConnections: -1,
                        //isSource: true,
                        isTarget: true,
                        deleteEndpointsOnDetach: false
                    });
                    nodes[entity.id + '_bottom'] = instance.addEndpoint(id, {
                        //anchor: [ "Perimeter", { shape: "Square" } ],
                        anchor: "Bottom",
                        maxConnections: -1,
                        isSource: true,
                        deleteEndpointsOnDetach: false

                                //isTarget: true
                    });

                    instance.draggable(id, {containment: '#schema-graph', stop: function() {
                            _Schema.storePositions();
                        }});

                });

                if (callback) {
                    callback();
                }

            }
        });
    },
    loadRels: function(callback) {
        var url = rootUrl + 'schema_relationships';
        $.ajax({
            url: url,
            dataType: 'json',
            contentType: 'application/json; charset=utf-8',
            success: function(data) {

                var sId, tId;
                $.each(data.result, function(i, res) {

                    if (sId === res.sourceId && tId === res.targetId) {
                        radius += 10;
                        stub += 30;
                        offset += .05;
                    } else {
                        radius = 20;
                        stub = 30;
                        offset = 0;
                    }

                    sId = res.sourceId;
                    tId = res.targetId;

                    rels[res.id] = instance.connect({
                        source: nodes[sId + '_bottom'],
                        target: nodes[tId + '_top'],
                        deleteEndpointsOnDetach: false,
                        connector: ["Flowchart", {cornerRadius: radius, stub: stub, gap: 6}],
                        parameters: {'id': res.id},
                        overlays: [
                            ["Label", {
                                    cssClass: "label multiplicity",
                                    label: res.sourceMultiplicity ? res.sourceMultiplicity : '*',
                                    location: .2 + offset,
                                    id: "sourceMultiplicity",
                                    events: {
                                        "click": function(label, evt) {
                                            evt.preventDefault();
                                            var overlay = rels[res.id].getOverlay('sourceMultiplicity');
                                            if (!(overlay.getLabel().substring(0, 1) === '<')) {
                                                overlay.setLabel('<input id="source-mult-label" type="text" size="15" id="id_' + res.id + '_sourceMultiplicity" value="' + overlay.label + '">');
                                                $('#source-mult-label').focus().on('blur', function() {
                                                    var label = ($(this).val() || '').trim();
                                                    _Schema.setRelationshipProperty(res.id, 'sourceMultiplicity', label);
                                                    overlay.setLabel(label);
                                                });
                                            }
                                        }
                                    }
                                }
                            ],
                            ["Label", {
                                    cssClass: "label rel-type",
                                    label: (res.relationshipType === initialRelType ? '&nbsp;' : res.relationshipType),
                                    location: .5 + offset,
                                    id: "label",
                                    events: {
                                        "click": function(label, evt) {
                                            evt.preventDefault();
                                            var overlay = rels[res.id].getOverlay('label');
                                            if (!(overlay.getLabel().substring(0, 1) === '<')) {
                                                overlay.setLabel('<input id="relationship-label" type="text" size="15" id="id_' + res.id + '_relationshipType" value="' + overlay.label + '">');
                                                $('#relationship-label').focus().on('blur', function() {
                                                    var label = ($(this).val() || '').trim();
                                                    _Schema.setRelationshipProperty(res.id, 'relationshipType', label);
                                                    overlay.setLabel(label);
                                                });
                                            }
                                        }
                                    }
                                }
                            ],
                            ["Label", {
                                    cssClass: "label multiplicity",
                                    label: res.targetMultiplicity ? res.targetMultiplicity : '*',
                                    location: .8 - offset,
                                    id: "targetMultiplicity",
                                    events: {
                                        "click": function(label, evt) {
                                            evt.preventDefault();
                                            var overlay = rels[res.id].getOverlay('targetMultiplicity');
                                            if (!(overlay.getLabel().substring(0, 1) === '<')) {
                                                overlay.setLabel('<input id="target-mult-label" type="text" size="15" id="id_' + res.id + '_targetMultiplicity" value="' + overlay.label + '">');
                                                $('#target-mult-label').focus().on('blur', function() {
                                                    var label = ($(this).val() || '').trim();
                                                    _Schema.setRelationshipProperty(res.id, 'targetMultiplicity', label);
                                                    overlay.setLabel(label);
                                                });
                                            }
                                        }
                                    }
                                }
                            ]

                        ]
                    });

                });

                if (callback) {
                    callback();
                }

            }
        });
    },
    loadNode: function(entity, el) {

        el.append('<div id="___' + entity.id + '" class="schema-details"><b>' + entity.name + '</b> extends <select class="extends-class-select"><option value="org.structr.core.entity.AbstractNode">AbstractNode</option></select>'
                + '<h3>Local Attributes</h3><table class="local schema-props"><th>JSON Name</th><th>DB Name</th><th>Type</th><th>Format</th><th>Not null</th><th>Unique</th><th>Default</th><th>Action</th></table>'
                + '<img alt="Add local attribute" class="add-icon add-local-attribute" src="icon/add.png">'
                + '<h3>Actions</h3><table class="actions schema-props"><th>JSON Name</th><th>Code</th><th>Action</th></table>'
                + '<img alt="Add action" class="add-icon add-action-attribute" src="icon/add.png">'
                + '<h3>Remote Attributes</h3><table class="related-attrs schema-props"><th>JSON Name</th><th>Type and Direction</th></table></div>');

        var n = $('.schema-details', el);
        n.children('b').on('click', function() {
            _Schema.makeNameEditable(n);
        });

        var classSelect = $('.extends-class-select', el);
        _Crud.loadAccessibleResources(function() {
            $.each(_Crud.types, function(t, type) {
                if (!type || type.startsWith('_')) {
                    return;
                }
                $.get(rootUrl + '_schema/' + type, function(data) {
                    if (data && data.result && data.result.length) {
                        var fqcn = data.result[0].className;
                        classSelect.append('<option ' + (entity.extendsClass === fqcn ? 'selected="selected"' : '') + ' value="' + fqcn + '">' + fqcn + '</option>');
                    }
                });

            });

        });

        classSelect.on('change', function() {
            var value = $(this).val();
            _Schema.putPropertyDefinition(entity.id, ' {"extendsClass":"' + value + '"}');

        });

        _Schema.appendLocalPropertiesAndActions(el, entity);
        _Schema.appendRemoteProperties(el, entity.id);

        $('.add-action-attribute', el).on('click', function() {
            actionsTable.append('<tr class="new"><td><input size="15" type="text" class="action property-name" placeholder="Enter method name"></td>'
                    + '<td><input size="15" type="text" class="action property-code" placeholder="Enter Code"></td><td><img alt="Remove" class="remove-icon remove-action" src="icon/delete.png"></td>'
                    + '</div');

            $('.new .property-code.action', el).on('blur', function() {
                _Schema.saveActionDefinition(entity.id, 'new');
            });

            $('.new .remove-action', el).on('click', function() {
                var self = $(this);
                self.closest('tr').remove();
            });

        });

    },
    appendLocalPropertiesAndActions: function(el, entity, compact) {

        var id = entity.id;

        if (compact) {
            el.append(
                    '<h3>Local Attributes</h3><table class="local schema-props"></table>'
                    + '<h3>Actions</h3><table class="actions schema-props"></table>');
        }

        var propertiesTable = $('.local.schema-props', el);
        var actionsTable = $('.actions.schema-props', el);

        $.each(Object.keys(entity), function(i, key) {
            _Schema.appendLocalProperty(propertiesTable, id, entity, key, compact);
        });

        $.each(Object.keys(entity), function(i, key) {
            _Schema.appendLocalAction(actionsTable, id, entity, key, compact);
        });

        if (!compact) {

            $('.add-local-attribute', el).on('click', function() {
                propertiesTable.append('<tr class="new"><td><input size="15" type="text" class="property-name" placeholder="Enter JSON name"></td>'
                        + '<td><input size="15" type="text" class="property-dbname" placeholder="Enter DB name"></td>'
                        + '<td>' + typeOptions + '</td>'
                        + '<td><input size="15" type="text" class="property-format" placeholder="Enter format"></td>'
                        + '<td><input class="not-null" type="checkbox"></td>'
                        + '<td><input class="unique" type="checkbox"></td>'
                        + '<td><input class="property-default" size="10" type="text"></td><td><img alt="Remove" class="remove-icon remove-property" src="icon/delete.png"></td></div>');

                $('.new .remove-property', el).on('click', function() {
                    var self = $(this);
                    self.closest('tr').remove();
                });

                $('.new .property-name', el).on('blur', function() {
                    var name = $('.new .property-name', el).val();
                    var dbName = $('.new .property-dbname', el).val();
                    var type = $('.new .property-type', el).val();
                    var format = $('.new .property-format', el).val();
                    var notNull = $('.new .not-null', el).is(':checked');
                    var unique = $('.new .unique', el).is(':checked');
                    var defaultValue = $('.new .property-default', el).val();

                    if (name && name.length && type) {
                        _Schema.putPropertyDefinition(entity.id, ' {"'
                                + '_' + name + '": "'
                                + (dbName ? dbName + '|' : '')
                                + (notNull ? '+' : '')
                                + (type === 'del' ? null : type)
                                + (unique ? '!' : '')
                                + (format ? '(' + format + ')' : '')
                                + (defaultValue ? ':' + defaultValue : '')
                                + '"}');
                    }
                });

                $('.new .property-type', el).on('change', function() {
                    var name = $('.new .property-name', el).val();
                    var dbName = $('.new .property-dbname', el).val();
                    var type = $('.new .property-type', el).val();
                    var format = $('.new .property-format', el).val();
                    var notNull = $('.new .not-null', el).is(':checked');
                    var unique = $('.new .unique', el).is(':checked');
                    var defaultValue = $('.new .property-default', el).val();
                    if (name && name.length && type && (type !== 'Enum' || (format && format.length))) {
                        _Schema.putPropertyDefinition(entity.id, ' {"'
                                + '_' + name + '": "'
                                + (dbName ? dbName + '|' : '')
                                + (notNull ? '+' : '')
                                + type
                                + (unique ? '!' : '')
                                + (format && format.length ? '(' + format + ')' : '')
                                + (defaultValue ? ':' + defaultValue : '')
                                + '"}');
                    }
                });

                $('.new .property-format', el).on('change', function() {
                    var name = $('.new .property-name', el).val();
                    var dbName = $(' .new .property-dbname', el).val();
                    var type = $('.new .property-type', el).val();
                    var notNull = $('.new .not-null', el).is(':checked');
                    var unique = $('.new .unique', el).is(':checked');
                    var format = $('.new .property-format', el).val();
                    var defaultValue = $('.new .property-default', el).val();
                    if (name && name.length && type && (type !== 'Enum' || (format && format.length))) {
                        _Schema.putPropertyDefinition(entity.id, ' {"'
                                + '_' + name + '": "'
                                + (dbName ? dbName + '|' : '')
                                + (notNull ? '+' : '')
                                + type
                                + (unique ? '!' : '')
                                + (defaultValue ? defaultValue : '')
                                + (format && format.length ? '(' + format + ')' : '')
                                + '"}');
                    }
                });
            });
        }

    },
    appendRemoteProperties: function(el, id, compact) {

        if (compact) {
            el.append('<h3>Remote Attributes</h3><table class="related-attrs schema-props"></table>');
        }

        var url = rootUrl + 'schema_relationships?sourceId=' + id;
        $.ajax({
            url: url,
            dataType: 'json',
            contentType: 'application/json; charset=utf-8',
            success: function(data) {

                $.each(data.result, function(i, res) {

                    var source = nodes[res.sourceId];
                    var target = nodes[res.targetId];

                    _Schema.getPropertyName(source.name, res.relationshipType, target.name, true, function(key) {
                        _Schema.appendRelatedProperty($('.related-attrs', el), source.id, res, res.targetJsonName ? res.targetJsonName : key, true);
                        instance.repaintEverything();
                    });

                });

            }
        });

        url = rootUrl + 'schema_relationships?targetId=' + id;
        $.ajax({
            url: url,
            dataType: 'json',
            contentType: 'application/json; charset=utf-8',
            success: function(data) {

                $.each(data.result, function(i, res) {

                    var source = nodes[res.sourceId];
                    var target = nodes[res.targetId];

                    _Schema.getPropertyName(target.name, res.relationshipType, source.name, false, function(key) {
                        _Schema.appendRelatedProperty($('.related-attrs', el), target.id, res, res.sourceJsonName ? res.sourceJsonName : key, false);
                        instance.repaintEverything();
                    });

                });

            }
        });

    },
    resize: function() {

        var w = $(window).width() - 24;
        var h = $(window).height() - 140;

        canvas.css({
            width: w + 'px',
            height: h + 'px',
        });

        $('body').css({
            position: 'relative',
//            background: '#fff'
        });

        $('html').css({
            background: '#fff'
        });

    },
    appendLocalProperty: function(el, id, res, key, compact) {

        if (key.startsWith('___')) {
            return false;
        }

        if (key.startsWith('_')) {

            var name = key.substring(1);
            var dbName = '';
            var type;
            if (res[key].indexOf('|') > -1) {
                dbName = res[key].substring(0, res[key].indexOf('|'));
                type = res[key].substring(res[key].indexOf('|') + 1);
            } else {
                type = res[key];
            }

            var notNull = (res[key].indexOf('+') > -1);
            var unique = (res[key].indexOf('!') > -1);

            type = type.replace('+', '').replace('!', '');

            var defaultValue = '';
            if (type.indexOf(':') > -1) {
                defaultValue = (type.substring(type.indexOf(':') + 1));
                type = type.substring(0, type.indexOf(':'));
            }

            var format;
            if (type.indexOf('(') > -1) {
                var parts = type.split('(');
                type = parts[0];
                format = parts[1].replace(')', '');
            }

            if (compact) {

                el.append('<tr class="' + key + '"><td>' + name + '</td>'
                        + '<td>' + type + '</td>'
                        + '<td>' + (format ? format : '') + '</td></div>');

            } else {

                el.append('<tr class="' + key + '"><td><input size="15" type="text" class="property-name" value="' + name + '"></td><td>'
                        + '<input size="15" type="text" class="property-dbname" value="' + dbName + '"></td><td>'
                        + typeOptions + '</td><td><input size="15" type="text" class="property-format" value="'
                        + (format ? format : '') + '"></td><td><input class="not-null" type="checkbox"'
                        + (notNull ? ' checked="checked"' : '') + '></td><td><input class="unique" type="checkbox"'
                        + (unique ? ' checked="checked"' : '') + '</td><td>'
                        + '<input type="text" size="10" class="property-default" value="' + defaultValue + '">' + '</td><td><img alt="Remove" class="remove-icon remove-property" src="icon/delete.png"></td></div>');

                $('.' + key + ' .property-type option[value="' + type + '"]', el).attr('selected', true);

                $('.' + key + ' .property-type', el).on('change', function() {
                    _Schema.savePropertyDefinition(res.id, key);
                });

                $('.' + key + ' .property-format', el).on('blur', function() {
                    _Schema.savePropertyDefinition(res.id, key);
                });

                $('.' + key + ' .not-null', el).on('change', function() {
                    _Schema.savePropertyDefinition(res.id, key);
                });

                $('.' + key + ' .unique', el).on('change', function() {
                    _Schema.savePropertyDefinition(res.id, key);
                });

                $('.' + key + ' .property-default', el).on('change', function() {
                    _Schema.savePropertyDefinition(res.id, key);
                });

                $('.' + key + ' .remove-property', el).on('click', function() {
                    Structr.confirmation('<h3>Delete property ' + key + '?</h3><p>Property values will not be removed from data nodes.</p>',
                            function() {
                                $.unblockUI({
                                    fadeOut: 25
                                });
                                _Schema.removePropertyDefinition(res.id, key);
                            });
                });

            }
        }

    },
    appendRelatedProperty: function(el, id, rel, key, out) {
        var relType = rel.relationshipType;
        relType = relType === undefinedRelType ? '' : relType;

        el.append('<tr class="' + key + '"><td><input size="15" type="text" class="property-name related" value="' + key + '"></td><td>'
                + (out ? '-' : '&lt;-') + '[:' + relType + ']' + (out ? '-&gt;' : '-') + '</td></tr>');

        $('.' + key + ' .property-name', el).on('blur', function() {

            var newName = $(this).val();

            if (newName === '') {
                newName = undefined;
            }

            if (out) {
                _Schema.setRelationshipProperty(rel.id, 'targetJsonName', newName);
            } else {
                _Schema.setRelationshipProperty(rel.id, 'sourceJsonName', newName);
            }
        });

    },
    appendLocalAction: function(el, id, res, key, compact) {

        if (key.startsWith('___')) {

            var name = key.substring(3);
            var value = res[key];
            //var prefix = name.startsWith('onCreate') || name.startsWith('onSave') || name.startsWith('onDelete') ? '-' : '+';

            if (compact) {
                el.append('<tr class="' + key + '"><td>' + name + '</td><td>' + value + '</td></tr>');
            } else {

                // append default actions
                el.append('<tr class="' + key + '"><td><input size="15" type="text" class="property-name action" value="' + name + '"></td><td><input size="30" type="text" class="property-code action" value="' + value + '"></td><td><img alt="Remove" class="remove-icon remove-action" src="icon/delete.png"></td></tr>');

                $('.' + key + ' .property-code.action').on('blur', function() {
                    _Schema.saveActionDefinition(res.id, key);
                });

                $('.' + key + ' .property-name.action').on('blur', function() {
                    _Schema.saveActionDefinition(res.id, key);
                });

                $('.' + key + ' .remove-action').on('click', function() {
                    Structr.confirmation('<h3>Delete action ' + key + '?</h3>',
                            function() {
                                $.unblockUI({
                                    fadeOut: 25
                                });
                                _Schema.removeActionDefinition(res.id, key);
                            });

                });
            }
        }
    },
    removePropertyDefinition: function(entityId, key) {
        _Schema.putPropertyDefinition(entityId, ' {"' + key + '":null}');
    },
    savePropertyDefinition: function(entityId, key) {
        var name = $('.' + key + ' .property-name').val();
        var dbName = $('.' + key + ' .property-dbname').val();
        var type = $('.' + key + ' .property-type').val();
        var format = $('.' + key + ' .property-format').val();
        var notNull = $('.' + key + ' .not-null').is(':checked');
        var unique = $('.' + key + ' .unique').is(':checked');
        var defaultValue = $('.' + key + ' .property-default').val();
        if (name && name.length && type) {

            if (type === 'del') {
                _Schema.putPropertyDefinition(entityId, ' {"_' + name + '":null}');
            } else {
                _Schema.putPropertyDefinition(entityId, ' {"'
                        + '_' + name + '": "'
                        + (dbName ? dbName + '|' : '')
                        + (notNull ? '+' : '')
                        + (type === 'del' ? null : type)
                        + (unique ? '!' : '')
                        + (format ? '(' + format + ')' : '')
                        + (defaultValue ? ':' + defaultValue : '')
                        + '"}');
            }
        }
    },
    removeActionDefinition: function(entityId, name) {
        _Schema.putPropertyDefinition(entityId, ' {"' + name + '": null}');
    },
    saveActionDefinition: function(entityId, key) {
        var name = $('.' + key + ' .action.property-name').val();
        var func = $('.' + key + ' .action.property-code').val();
        //
        if (name && name.length) {

            _Schema.putPropertyDefinition(entityId, ' {"'
                    + '___' + name + '": "' + (func ? func : '')
                    + '"}');
        }

    },
    putPropertyDefinition: function(id, data) {
        log('putPropertyDefinition', id, data);
        $.ajax({
            url: rootUrl + 'schema_nodes/' + id,
            type: 'PUT',
            dataType: 'json',
            contentType: 'application/json; charset=utf-8',
            data: data,
            statusCode: {
                200: function() {
                    _Schema.reload();
                },
                422: function(data) {
                    Structr.errorFromResponse(data.responseJSON);
                }
            }
        });
    },
    createNode: function(type) {
        var url = rootUrl + 'schema_nodes';
        $.ajax({
            url: url,
            type: 'POST',
            dataType: 'json',
            contentType: 'application/json; charset=utf-8',
            data: '{ "name": "' + type + '"}',
            statusCode: {
                201: function() {
                    _Schema.reload();
                },
                422: function(data) {
                    Structr.errorFromResponse(data.responseJSON);
                }
            }

        });
    },
    deleteNode: function(id) {
        var url = rootUrl + 'schema_nodes/' + id;
        $.ajax({
            url: url,
            type: 'DELETE',
            dataType: 'json',
            contentType: 'application/json; charset=utf-8',
            statusCode: {
                200: function() {
                    _Schema.reload();
                },
                422: function(data) {
                    Structr.errorFromResponse(data.responseJSON);
                }
            }

        });
    },
    createRelationshipDefinition: function(sourceId, targetId, relationshipType) {
        var data = '{"sourceId":"' + sourceId + '","targetId":"' + targetId + '"'
                + (relationshipType && relationshipType.length ? ',"relationshipType":"' + relationshipType + '"' : '')
                + ', "sourceMultiplicity" : "*", "targetMultiplicity" : "*"'
                + '}';
        $.ajax({
            url: rootUrl + 'schema_relationships',
            type: 'POST',
            dataType: 'json',
            contentType: 'application/json; charset=utf-8',
            data: data,
            statusCode: {
                201: function() {
                    _Schema.reload();
                },
                422: function(data) {
                    Structr.errorFromResponse(data.responseJSON);
                }
            }
        });
    },
    removeRelationshipDefinition: function(id) {
        $.ajax({
            url: rootUrl + 'schema_relationships/' + id,
            type: 'DELETE',
            dataType: 'json',
            contentType: 'application/json; charset=utf-8',
            statusCode: {
                200: function(data, textStatus, jqXHR) {
                    _Schema.reload();
                },
                422: function(data) {
                    Structr.errorFromResponse(data.responseJSON);
                }
            }
        });
    },
    setRelationshipProperty: function(entityId, key, value) {
        var data = {};
        data[key] = cleanText(value);
        $.ajax({
            url: rootUrl + 'schema_relationships/' + entityId,
            type: 'PUT',
            dataType: 'json',
            contentType: 'application/json; charset=utf-8',
            data: JSON.stringify(data),
            statusCode: {
                200: function(data, textStatus, jqXHR) {
                    _Schema.reload();
                },
                422: function(data) {
                    Structr.errorFromResponse(data.responseJSON);
                }
            }
        });
    },
    connect: function(sourceId, targetId) {
        //Structr.dialog('Enter relationship details');
        _Schema.createRelationshipDefinition(sourceId, targetId, initialRelType);

    },
    detach: function(relationshipId) {
        //Structr.dialog('Enter relationship details');
        _Schema.removeRelationshipDefinition(relationshipId);
    },
    makeNameEditable: function(element) {
        //element.off('dblclick');

        var id = element.prop('id').substring(3);

        element.off('hover');
        element.children('b').hide();
        var oldName = $.trim(element.children('b').text());
        var input = $('input.new-name', element);

        if (!input.length) {
            element.prepend('<input type="text" size="' + (oldName.length + 8) + '" class="new-name" value="' + oldName + '">');
            input = $('input.new-name', element);
        }

        input.show().focus().select();

        input.on('blur', function() {
            _Schema.changeName(id, element, input, oldName);
            return false;
        });

        input.keypress(function(e) {
            if (e.keyCode === 13 || e.keyCode === 9) {
                e.preventDefault();
                _Schema.changeName(id, element, input, oldName);
                return false;
            }
        });
        element.off('click');
    },
    changeName: function(id, element, input, oldName) {
        var newName = input.val();
        input.hide();
        element.children('b').text(newName).show();
        if (oldName !== newName) {
            _Schema.putPropertyDefinition(id, JSON.stringify({name: newName}));
        }
    },
    importGraphGist: function(graphGistUrl, text) {
        $.ajax({
            url: rootUrl + 'maintenance/importGist',
            type: 'POST',
            data: JSON.stringify({'url': graphGistUrl}),
            contentType: 'application/json',
            statusCode: {
                200: function() {
                    var btn = $('#import-ggist');
                    btn.removeClass('disabled').attr('disabled', null);
                    btn.html(text + ' <img src="icon/tick.png">');
                    window.setTimeout(function() {
                        $('img', btn).fadeOut();
                        document.location.reload();
                    }, 1000);
                }
            }
        });
    },
    openAdminTools: function() {
        Structr.dialog('Admin Tools', function() {
        }, function() {
        });

        dialogText.append('<table id="admin-tools-table">');
        $('#admin-tools-table').append('<tr><td><button id="rebuild-index">Rebuild Index</button></td><td><label for"rebuild-index">Rebuild database index for all nodes and relationships</label></td></tr>');
        $('#admin-tools-table').append('<tr><td><button id="clear-schema">Clear Schema</button></td><td><label for"clear-schema">Delete all schema nodes and relationships of dynamic schema</label></td></tr>');
        $('#admin-tools-table').append('<tr><td><select id="node-type-selector"><option value="">-- Select Node Type --</option></select><!--select id="rel-type-selector"><option>-- Select Relationship Type --</option></select--><button id="add-uuids">Add UUIDs</button></td><td><label for"setUuid">Add UUIDs to all nodes of the selected type</label></td></tr>');
        $('#admin-tools-table').append('</table>');

        var nodeTypeSelector = $('#node-type-selector');

        $('#rebuild-index').on('click', function(e) {
            var btn = $(this);
            var text = btn.text();
            btn.attr('disabled', 'disabled').addClass('disabled').html(text + ' <img src="img/al.gif">');
            e.preventDefault();
            $.ajax({
                url: rootUrl + 'maintenance/rebuildIndex',
                type: 'POST',
                data: {},
                contentType: 'application/json',
                statusCode: {
                    200: function() {
                        var btn = $('#rebuild-index');
                        btn.removeClass('disabled').attr('disabled', null);
                        btn.html(text + ' <img src="icon/tick.png">');
                        window.setTimeout(function() {
                            $('img', btn).fadeOut();
                        }, 1000);
                    }
                }
            });
        });

        $('#clear-schema').on('click', function(e) {

            Structr.confirmation('<h3>Delete schema?</h3><p>This will remove all dynamic schema information, but not your other data.</p><p>&nbsp;</p>',
                    function() {
                        $.unblockUI({
                            fadeOut: 25
                        });

                        var btn = $(this);
                        var text = btn.text();
                        btn.attr('disabled', 'disabled').addClass('disabled').html(text + ' <img src="img/al.gif">');
                        e.preventDefault();
                        $.ajax({
                            url: rootUrl + 'schema_relationships',
                            type: 'DELETE',
                            data: {},
                            contentType: 'application/json',
                            statusCode: {
                                200: function() {
                                    _Schema.reload();
                                    $.ajax({
                                        url: rootUrl + 'schema_nodes',
                                        type: 'DELETE',
                                        data: {},
                                        contentType: 'application/json',
                                        statusCode: {
                                            200: function() {
                                                _Schema.reload();
                                                var btn = $('#clear-schema');
                                                btn.removeClass('disabled').attr('disabled', null);
                                                btn.html(text + ' <img src="icon/tick.png">');
                                                window.setTimeout(function() {
                                                    $('img', btn).fadeOut();
                                                }, 1000);
                                            }
                                        }
                                    });

                                }
                            }
                        });
                    });
        });

        Command.list('SchemaNode', true, 100, 1, 'name', 'asc', function(n) {
            $('#node-type-selector').append('<option>' + n.name + '</option>');
        });

        Command.list('SchemaRelationship', true, 100, 1, 'relationshipType', 'asc', function(r) {
            $('#rel-type-selector').append('<option>' + r.relationshipType + '</option>');
        });

        $('#add-uuids').on('click', function(e) {
            var btn = $(this);
            var text = btn.text();
            e.preventDefault();
            var type = nodeTypeSelector.val();
            var relType = $('#rel-type-selector').val();
            if (!type) {
                nodeTypeSelector.addClass('notify');
                nodeTypeSelector.on('change', function() {
                    nodeTypeSelector.removeClass('notify');
                });
                return;
            }
            btn.attr('disabled', 'disabled').addClass('disabled').html(text + ' <img src="img/al.gif">');
            $.ajax({
                url: rootUrl + 'maintenance/setUuid',
                type: 'POST',
                data: JSON.stringify({'type': type, 'relType': relType}),
                contentType: 'application/json',
                statusCode: {
                    200: function() {
                        var btn = $('#add-uuids');
                        nodeTypeSelector.removeClass('notify');
                        btn.removeClass('disabled').attr('disabled', null);
                        btn.html(text + ' <img src="icon/tick.png">');
                        window.setTimeout(function() {
                            $('img', btn).fadeOut();
                        }, 1000);
                    }
                }
            });
        });

    },
    getPropertyName: function(type, relationshipType, relatedType, out, callback) {
        $.ajax({
            url: rootUrl + '_schema/' + type,
            type: 'GET',
            contentType: 'application/json',
            statusCode: {
                200: function(data) {
                    var properties = data.result[0].views.public;
                    Object.keys(properties).forEach(function(key) {
                        var obj = properties[key];
                        var simpleClassName = obj.className.split('.')[obj.className.split('.').length - 1];
                        if (obj.relatedType && obj.relationshipType) {
                            if (obj.relatedType.endsWith(relatedType) && obj.relationshipType === relationshipType && ((simpleClassName.startsWith('EndNode') && out)
                                    || (simpleClassName.startsWith('StartNode') && !out))) {
                                callback(key, obj.isCollection);
                            }

                        }
                    });
                }
            }
        });

    },
    toggleView: function(id) {

        var node = $('#id_' + id);
        var mode = _Schema.getMode(id);
        
        if (mode === 'compact') {

            _Schema.expandView(id, node);
            _Schema.storeMode(id, 'expanded');

        } else {

            $('.toggle-view', node).attr('src', 'icon/arrow_out.png');

            $('h3', node).remove();
            $('.local.schema-props', node).remove();
            $('.related-attrs.schema-props', node).remove();
            $('.actions.schema-props', node).remove();

            node.addClass('compact');
            node.removeClass('expanded');

            _Schema.storeMode(id, 'compact');
        }

        instance.repaintEverything();

    },
    expandView: function(id) {
        
        var node = $('#id_' + id);
        $('.toggle-view', node).attr('src', 'icon/arrow_in.png');

        Command.get(id, function(entity) {
            _Schema.appendLocalPropertiesAndActions(node, entity, true);
            _Schema.appendRemoteProperties(node, entity.id, true);
        });

        node.addClass('expanded');
        node.removeClass('compact');
    }
    
};

var typeOptions = '<select class="property-type"><option value="">--Select type--</option>'
        + '<option value="String">String</option>'
        + '<option value="Integer">Integer</option>'
        + '<option value="Long">Long</option>'
        + '<option value="Double">Double</option>'
        + '<option value="Boolean">Boolean</option>'
        + '<option value="Enum">Enum</option>'
        + '<option value="Date">Date</option>'
        + '<option value="Counter">Counter</option>'
        + '<option value="Function">Function</option>'
        + '<option value="Notion">Function</option>'
        + '<option value="del">--DELETE--</option></select>';