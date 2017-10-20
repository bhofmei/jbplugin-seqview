define('SeqViewsPlugin/main', [
    'dojo/_base/declare',
    'dojo/_base/lang',
    'dojo/_base/event',
    'dojo/on',
    'JBrowse/Util',
    'JBrowse/has',
    'JBrowse/Plugin'
  ],
  function (
    declare,
    lang,
    domEvent,
    on,
    Util,
    has,
    JBrowsePlugin
  ) {
    return declare(JBrowsePlugin, {
      constructor: function (args) {
        var thisB = this;
        var browser = this.browser;
        this.config.version = '1.0.3'
        console.log('SeqViewsPlugin starting - v' + this.config.version);

        browser.afterMilestone('loadConfig', function () {
          if (typeof browser.config.classInterceptList === 'undefined') {
            browser.config.classInterceptList = {};
          }

          // override CanvasFeatures
          require(["dojo/_base/lang", "JBrowse/View/Track/CanvasFeatures"], function (lang, CanvasFeatures) {
            lang.extend(CanvasFeatures, {
              //config['displayStyle']: (browser.cookie("track-style-"+this.name) || 'default'),
              fillBlock: thisB.fillBlock,
              _trackMenuOptions: thisB._trackMenuOptions,
              _attachMouseOverEvents: thisB._attachMouseOverEvents

            });
          });

          require(["dojo/_base/lang", "JBrowse/View/Track/HTMLFeatures"], function (lang, HTMLFeatures) {
            lang.extend(HTMLFeatures, {
              fillBlock: thisB.fillBlockHTML,
              _trackMenuOptions: thisB._trackMenuOptionsHTML

            });
          });
        });
      },

      fillBlock: function (args) {
        var blockIndex = args.blockIndex;
        var block = args.block;
        var leftBase = args.leftBase;
        var rightBase = args.rightBase;
        var scale = args.scale;

        if (!has('canvas')) {
          this.fatalError = 'This browser does not support HTML canvas elements.';
          this.fillBlockError(blockIndex, block, this.fatalError);
          return;
        }
        if (!this.config.hasOwnProperty('displayStyle')) {
          this.config.displayStyle = 'default';
        }

        var fill = lang.hitch(this, function (stats) {

          // calculate some additional view parameters that
          // might depend on the feature stats and add them to
          // the view args we pass down
          var renderArgs = lang.mixin({
              stats: stats,
              displayMode: this.displayMode,
              displayStyle: this.config.displayStyle,
              showFeatures: scale >= (this.config.style.featureScale ||
                (stats.featureDensity || 0) / this.config.maxFeatureScreenDensity),
              showFeaturesBackup: scale >= (this.config.style.featureScale ||
                (stats.featureDensity || 0) / (this.config.maxFeatureScreenDensity * 10)),
              showLabels: this.showLabels && this.displayMode === "normal" &&
                scale >= (this.config.style.labelScale ||
                  (stats.featureDensity || 0) * this.config.style._defaultLabelScale),
              showDescriptions: this.showLabels && this.displayMode === "normal" &&
                scale >= (this.config.style.descriptionScale ||
                  (stats.featureDensity || 0) * this.config.style._defaultDescriptionScale)
            },
            args
          );
          if ((renderArgs.showFeatures && renderArgs.displayStyle !== 'histograms') || (renderArgs.showFeaturesBackup && renderArgs.displayStyle === 'features')) {
            this.setLabel(this.key);
            this.removeYScale();
            this.fillFeatures(renderArgs);
          } else if ((this.config.histograms.store || this.store.getRegionFeatureDensities) && renderArgs.displayStyle !== 'features') {
            this.fillHistograms(renderArgs);
          } else if (renderArgs.displayStyle === 'histograms') {
            // no histogram data available but histogram style, so display message
            this.setLabel(this.key);
            this.fillMessage(blockIndex, block, 'No underlying histogram data; change display style.');
            args.finishCallback();
          } else {
            this.setLabel(this.key);
            this.removeYScale();
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
          lang.hitch(this, function (e) {
            this._handleError(e, args);
            args.finishCallback(e);
          })
        );
      },

      fillBlockHTML: function (args) {
        var blockIndex = args.blockIndex;
        var block = args.block;
        var leftBase = args.leftBase;
        var rightBase = args.rightBase;
        var scale = args.scale;
        var containerStart = args.containerStart;
        var containerEnd = args.containerEnd;

        var region = {
          ref: this.refSeq.name,
          start: leftBase,
          end: rightBase
        };

        if (!this.config.hasOwnProperty('displayStyle')) {
          this.config.displayStyle = 'default';
        }

        var fill = lang.hitch(this, function (stats) {
          var density = stats.featureDensity;
          var histScale = this.config.style.histScale || density * this.config.style._defaultHistScale;
          var featureScale = this.config.style.featureScale || density / this.config.maxFeatureScreenDensity; // (feat/bp) / ( feat/px ) = px/bp )

          // only update the label once for each block size
          var blockBases = Math.abs(leftBase - rightBase);
          if (this._updatedLabelForBlockSize != blockBases) {
            // if histograms
            if (this.store.getRegionFeatureDensities && (scale < histScale || this.config.displayStyle === "histograms")) {
              this.setLabel(this.key + ' <span class="feature-density">per ' +
                Util.addCommas(Math.round(blockBases / this.numBins)) +
                ' bp</span>');
            } else {
              this.setLabel(this.key);
            }
            this._updatedLabelForBlockSize = blockBases;
          }

          // if our store offers density histograms, and we are zoomed out far enough, draw them
          if (this.store.getRegionFeatureDensities && (scale < histScale || this.config.displayStyle === "histograms")) {
            this._fillType = 'histograms';
            this.fillHistograms(args);
          }
          // if we have no histograms, check the predicted density of
          // features on the screen, and display a message if it's
          // bigger than maxFeatureScreenDensity
          else if (scale < featureScale && this.config.displayStyle !== 'features') {
            this.fillTooManyFeaturesMessage(
              blockIndex,
              block,
              scale
            );
            args.finishCallback();
          } else {
            // if we have transitioned to viewing features, delete the
            // y-scale used for the histograms
            this.removeYScale();
            this._fillType = 'features';
            this.fillFeatures(lang.mixin({
              stats: stats
            }, args));
          }
        });

        this.store.getGlobalStats(
          fill,
          lang.hitch(this, 'fillBlockError', blockIndex, block)
        );
      },

      _attachMouseOverEvents: function () {
        var gv = this.browser.view;
        var thisB = this;

        if (this.displayMode === 'collapsed') {
          if (this._mouseoverEvent) {
            this._mouseoverEvent.remove();
            delete this._mouseoverEvent;
          }

          if (this._mouseoutEvent) {
            this._mouseoutEvent.remove();
            delete this._mouseoutEvent;
          }
        } else {
          if (!this._mouseoverEvent) {
            this._mouseoverEvent = this.own(on(this.staticCanvas, 'mousemove', function (evt) {
              if (thisB.config.displayStyle === 'histograms' || thisB.layout === undefined)
                return;
              evt = domEvent.fix(evt);
              var bpX = gv.absXtoBp(evt.clientX);
              var feature = thisB.layout.getByCoord(bpX, (evt.offsetY === undefined ? evt.layerY : evt.offsetY));
              thisB.mouseoverFeature(feature, evt);
            }))[0];
          }

          if (!this._mouseoutEvent) {
            this._mouseoutEvent = this.own(on(this.staticCanvas, 'mouseout', function () {
              thisB.mouseoverFeature(undefined);
            }))[0];
          }
        }
      },

      _trackMenuOptions: function () {
        var opts = this.inherited(arguments);
        var thisB = this;

        var displayModeList = ["normal", "compact", "collapsed"];
        this.displayModeMenuItems = displayModeList.map(function (displayMode) {
          return {
            label: displayMode,
            type: 'dijit/CheckedMenuItem',
            title: "Render this track in " + displayMode + " mode",
            checked: thisB.displayMode === displayMode,
            onClick: function () {
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

        /*var updateMenuItems = lang.hitch(this, function() {
            var index;
            for(index in this.displayModeMenuItems) {
                this.displayModeMenuItems[index].checked = (this.displayMode === this.displayModeMenuItems[index].label);
            }
        });*/

        var displayStyleList = ['default', 'features', 'histograms'];
        var displayStyleTitle = {
          'default': 'Display features/histograms based on zoom',
          'features': 'Force track to display with features',
          'histograms': 'Force track to display with histograms'
        };

        this.displayModeMenuItems.push.apply(this.displayModeMenuItems, [{
          type: 'dijit/MenuSeparator'
        }]);
        this.displayModeMenuItems.push.apply(this.displayModeMenuItems, displayStyleList.map(function (displayStyle) {
          return {
            label: displayStyle,
            type: 'dijit/CheckedMenuItem',
            title: (displayStyleTitle[displayStyle] || 'Display track in ' + displayStyle),
            checked: thisB.config.displayStyle === displayStyle,
            onClick: function () {
              thisB.config.displayStyle = displayStyle;
              thisB._clearLayout();
              thisB.hideAll();
              thisB.genomeView.showVisibleBlocks(true);
              thisB.makeTrackMenu();
            }
          };
        }));

        opts.push.apply(
          opts, [{
              type: 'dijit/MenuSeparator'
            },
            {
              label: "Display mode",
              iconClass: "dijitIconApplication",
              title: "Toggle histograms/features or make features smaller",
              children: this.displayModeMenuItems
            },
            {
              label: 'Show labels',
              type: 'dijit/CheckedMenuItem',
              checked: !!('showLabels' in this ? this.showLabels : this.config.style.showLabels),
              onClick: function () {
                thisB.showLabels = this.checked;
                thisB.changed();
              }
            }
          ]
        );

        return opts;
      },

      _trackMenuOptionsHTML: function () {
        var o = this.inherited("_trackMenuOptions", arguments);
        var thisB = this;
        var displayStyleList = ['default', 'features', 'histograms'];
        var displayStyleTitle = {
          'default': 'Display features/histograms based on zoom',
          'features': 'Force track to display with features',
          'histograms': 'Force track to display with histograms'
        };
        this.displayModeMenuItems = displayStyleList.map(function (displayStyle) {
          return {
            label: displayStyle,
            type: 'dijit/CheckedMenuItem',
            title: (displayStyleTitle[displayStyle] || 'Display track in ' + displayStyle),
            checked: thisB.config.displayStyle === displayStyle,
            onClick: function () {
              thisB.config.displayStyle = displayStyle;
              thisB._clearLayout();
              thisB.hideAll();
              thisB.genomeView.showVisibleBlocks(true);
              thisB.makeTrackMenu();
            }
          };
        });

        o.push.apply(
          o, [{
            type: 'dijit/MenuSeparator'
          }, {
            label: "Display mode",
            iconClass: "dijitIconApplication",
            title: "Toggle histograms/features",
            children: this.displayModeMenuItems
          }, {
            label: 'Show labels',
            type: 'dijit/CheckedMenuItem',
            checked: !!('showLabels' in this ? this.showLabels : this.config.style.showLabels),
            onClick: function () {
              thisB.showLabels = this.checked;
              thisB.changed();
            }
          }]
        );

        return o;
      }
    });
  });
