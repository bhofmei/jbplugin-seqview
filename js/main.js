require({cache:{
'JBrowse/Plugin':function(){
define("JBrowse/Plugin", [
           'dojo/_base/declare',
           'JBrowse/Component'
       ],
       function( declare, Component ) {
return declare( Component,
{
    constructor: function( args ) {
        this.name = args.name;
        this.cssLoaded = args.cssLoaded;
        this._finalizeConfig( args.config );
    },

    _defaultConfig: function() {
        return {
            baseUrl: '/plugins/'+this.name
        };
    }
});
});
}}});
define('SeqViewsPlugin/main', [ 
    'dojo/_base/declare',
    'dojo/_base/lang',
    'JBrowse/has',
    'JBrowse/Plugin'
],
    function(
        declare,
        lang,
        has,
        JBrowsePlugin
    ) { 
return declare( JBrowsePlugin,
{
    constructor: function( args ) {
        var thisB = this;
        var browser = this.browser;
        console.log("plugin: SeqViews");
        
        browser.afterMilestone( 'loadConfig', function() {
            if (typeof browser.config.classInterceptList === 'undefined') {
                browser.config.classInterceptList = {};
            }
            
            // override WiggleBase
            require(["dojo/_base/lang", "JBrowse/View/Track/CanvasFeatures"], function(lang, CanvasFeatures){
                lang.extend( CanvasFeatures, {
                    //config['displayStyle']: (browser.cookie("track-style-"+this.name) || 'default'),
                    fillBlock: thisB.fillBlock,
                    _trackMenuOptions: thisB._trackMenuOptions
                    
                });
            });
        });      
    },
    
    fillBlock: function( args ) {
        var blockIndex = args.blockIndex;
        var block = args.block;
        var leftBase = args.leftBase;
        var rightBase = args.rightBase;
        var scale = args.scale;

        if( ! has('canvas') ) {
            this.fatalError = 'This browser does not support HTML canvas elements.';
            this.fillBlockError( blockIndex, block, this.fatalError );
            return;
        }
        if(!this.config.hasOwnProperty('displayStyle')){
            this.config.displayStyle = 'default';
        }
        //console.log(JSON.stringify(this.config));

        var fill = lang.hitch( this, function( stats ) {

                // calculate some additional view parameters that
                // might depend on the feature stats and add them to
                // the view args we pass down
                var renderArgs = lang.mixin(
                    {
                        stats: stats,
                        displayMode: this.displayMode,
                        displayStyle: this.config.displayStyle,
                        showFeatures: scale >= ( this.config.style.featureScale
                                                 || (stats.featureDensity||0) / this.config.maxFeatureScreenDensity ),
                        showFeaturesBackup: scale >= ( this.config.style.featureScale
                                                 || (stats.featureDensity||0) / (this.config.maxFeatureScreenDensity*10) ),
                        showLabels: this.showLabels && this.displayMode == "normal"
                            && scale >= ( this.config.style.labelScale
                                          || (stats.featureDensity||0) * this.config.style._defaultLabelScale ),
                        showDescriptions: this.showLabels && this.displayMode == "normal"
                            && scale >= ( this.config.style.descriptionScale
                                          || (stats.featureDensity||0) * this.config.style._defaultDescriptionScale)
                    },
                    args
                );
                if( (renderArgs.showFeatures && renderArgs.displayStyle !== 'histograms') || (renderArgs.showFeaturesBackup && renderArgs.displayStyle === 'features')) {
                    this.setLabel( this.key );
                    this.removeYScale();
                    this.fillFeatures( renderArgs );
                }
                else if( (this.config.histograms.store || this.store.getRegionFeatureDensities) && renderArgs.displayStyle !== 'features' ) {
                    this.fillHistograms( renderArgs );
                }
                else if(renderArgs.displayStyle === 'histograms'){
                    // no histogram data available but histogram style, so display message
                    this.setLabel(this.key);
                    this.fillMessage( blockIndex, block, 'No underlying histogram data; change display style.');
                    args.finishCallback();
                }
                else {
                    this.setLabel( this.key );
                    this.fillTooManyFeaturesMessage(
                        blockIndex,
                        block,
                        scale
                    );
                    args.finishCallback();
                }
            });

        this.store.getGlobalStats(
            fill,
            dojo.hitch( this, function(e) {
                            this._handleError( e, args );
                            args.finishCallback(e);
                        })
        );
    },
    
    _trackMenuOptions: function () {
        var opts = this.inherited(arguments);
        var thisB = this;
        //console.log(thisB.config.displayStyle);

        var displayModeList = ["normal", "compact", "collapsed"];
        this.displayModeMenuItems = displayModeList.map(function(displayMode) {
            return {
                label: displayMode,
                type: 'dijit/CheckedMenuItem',
                title: "Render this track in " + displayMode + " mode",
                checked: thisB.displayMode == displayMode,
                onClick: function() {
                    thisB.displayMode = displayMode;
                    thisB._clearLayout();
                    thisB.hideAll();
                    thisB.genomeView.showVisibleBlocks(true);
                    thisB.makeTrackMenu();

                    // set cookie for displayMode
                    thisB.browser.cookie('track-' + thisB.name, thisB.displayMode);
                }
            };
        });

        var updateMenuItems = dojo.hitch(this, function() {
            for(var index in this.displayModeMenuItems) {
                this.displayModeMenuItems[index].checked = (this.displayMode == this.displayModeMenuItems[index].label);
            }
        });
        
        var displayStyleList=['default','features','histograms'];
        var displayStyleTitle={default: 'Display features/histograms based on zoom',
                              features:'Force track to display with features',
                              histograms:'Force track to display with histograms'};
        var displayStyleMenuItems = displayStyleList.map(function(displayStyle){
            return{
                label:displayStyle,
                type: 'dijit/CheckedMenuItem',
                title: (displayStyleTitle[displayStyle]|| 'Display track in '+displayStyle),
                checked: thisB.config.displayStyle == displayStyle,
                onClick: function(){
                    thisB.config.displayStyle = displayStyle;
                    thisB._clearLayout();
                    thisB.hideAll();
                    thisB.genomeView.showVisibleBlocks(true);
                    thisB.makeTrackMenu();
                }  
            };
        });
        var updateStyleMenuItems = dojo.hitch(this, function() {
            for(var index in displayStyleMenuItems) {
                displayStyleMenuItems[index].checked = (this.config.displayStyle == displayStyleMenuItems[index].label);
            }
        });
        
        this.displayModeMenuItems.push.apply(this.displayModeMenuItems, [
           { type:'dijit/MenuSeparator'}
        ]);
        this.displayModeMenuItems.push.apply(this.displayModeMenuItems, displayStyleList.map(function(displayStyle){
            return{
                label:displayStyle,
                type: 'dijit/CheckedMenuItem',
                title: (displayStyleTitle[displayStyle]|| 'Display track in '+displayStyle),
                checked: thisB.config.displayStyle == displayStyle,
                onClick: function(){
                    thisB.config.displayStyle = displayStyle;
                    thisB._clearLayout();
                    thisB.hideAll();
                    thisB.genomeView.showVisibleBlocks(true);
                    thisB.makeTrackMenu();
                }  
            };
        }));
        var updateStyleMenuItems = dojo.hitch(this, function() {
            for(var index in this.displayStyleMenuItems) {
                this.displayModeMenuItems[index].checked = (this.config.displayStyle == this.displayModeMenuItems[index].label);
            }
        });

        opts.push.apply(
            opts,
            [
                { type: 'dijit/MenuSeparator' },
                {
                    label: "Display mode",
                    iconClass: "dijitIconPackage",
                    title: "Toggle histograms/features or make features smaller",
                    children: this.displayModeMenuItems
                },
                { label: 'Show labels',
                  type: 'dijit/CheckedMenuItem',
                  checked: !!( 'showLabels' in this ? this.showLabels : this.config.style.showLabels ),
                  onClick: function(event) {
                      thisB.showLabels = this.checked;
                      thisB.changed();
                  }
                }
            ]
        );

        return opts;
    }
});
});
