/**
 * The Core of Image Editor
 */
(function () {
  'use strict';

  /**
   * Image Editor class
   * @param {String} containerSelector jquery selector for image editor container
   * @param {Array} buttons define toolbar buttons 
   * @param {Array} shapes define shapes
   */
  var ImageEditor = function (containerSelector, buttons, shapes) {
    this.containerSelector = containerSelector;
    this.containerEl = $(containerSelector);

    this.buttons = buttons;
    this.shapes = shapes;

    this.containerEl.addClass('default-container');

    this.canvas = null;
    this.activeTool = null;
    this.activeSelection = null;

    /**
     * Get current state of canvas as object
     * @returns {Object}
     */
    this.getCanvasJSON = () => {
      return this.canvas.toJSON();
    }

    /**
     * Set canvas status by object
     * @param {Object} current the object of fabric canvas status
     */
    this.setCanvasJSON = (current) => {
      current && this.canvas.loadFromJSON(JSON.parse(current), this.canvas.renderAll.bind(this.canvas))
    }

    /**
     * Event handler to set active tool
     * @param {String} id tool id
     */
    this.setActiveTool = (id) => {
      this.activeTool = id;
      $(`${containerSelector} .toolpanel`).removeClass('visible');
      if (id !== 'select' || (id == 'select' && this.activeSelection)) {
        $(`${containerSelector} .toolpanel#${id}-panel`).addClass('visible');
        if (id === 'select') {
          console.log('selection')
          $(`${containerSelector} .toolpanel#${id}-panel`).attr('class', `toolpanel visible type-${this.activeSelection.type}`)
        }
      }

      if (id !== 'select') {
        this.canvas.discardActiveObject();
        this.canvas.renderAll();
        this.activeSelection = null;
      }

      this.canvas.isDrawingLineMode = false;
      this.canvas.isDrawingPathMode = false;
      this.canvas.isDrawingMode = false;
      this.canvas.isDrawingTextMode = false;

      this.canvas.defaultCursor = 'default';
      this.canvas.selection = true;
      this.canvas.forEachObject(o => {
        o.selectable = true;
        o.evented = true;
      })

      switch (id) {
        case 'draw':
          this.canvas.isDrawingMode = true;
          break;
        case 'line':
          this.canvas.isDrawingLineMode = true
          this.canvas.defaultCursor = 'crosshair'
          this.canvas.selection = false
          this.canvas.forEachObject(o => {
            o.selectable = false
            o.evented = false
          });
          break;
        case 'path':
          this.canvas.isDrawingPathMode = true
          this.canvas.defaultCursor = 'crosshair'
          this.canvas.selection = false
          this.canvas.forEachObject(o => {
            o.selectable = false
            o.evented = false
          });
          this.updateTip('Tip: click to place points, press and pull for curves! Click outside or press Esc to cancel!');
          break;
        case 'textbox':
          this.canvas.isDrawingTextMode = true
          this.canvas.defaultCursor = 'crosshair'
          this.canvas.selection = false
          this.canvas.forEachObject(o => {
            o.selectable = false
            o.evented = false
          });
          break;
        case 'upload':
          this.openDragDropPanel();
          break;
        default:
          this.updateTip('Tip: hold Shift when drawing a line for 15° angle jumps!');
          break;
      }
    }

    /**
     * Event handler when perform undo
     */
    this.undo = () => {
      console.log('undo')
      try {
        let undoList = this.history.getValues().undo;
        if (undoList.length) {
          let current = undoList[undoList.length - 1];
          this.history.undo();
          current && this.canvas.loadFromJSON(JSON.parse(current), this.canvas.renderAll.bind(this.canvas))
        }
      } catch (_) {
        console.error("undo failed")
      }
    }

    /**
     * Event handler when perform redo
     */
    this.redo = () => {
      console.log('redo')
      try {
        let redoList = this.history.getValues().redo;
        if (redoList.length) {
          let current = redoList[redoList.length - 1];
          this.history.redo();
          current && this.canvas.loadFromJSON(JSON.parse(current), this.canvas.renderAll.bind(this.canvas))
        }
      } catch (_) {
        console.error("redo failed")
      }
    }

    /**
     * Event handler when select objects on fabric canvas
     * @param {Object} activeSelection fabric js object
     */
    this.setActiveSelection = (activeSelection) => {
      this.activeSelection = activeSelection;
      this.setActiveTool('select');
    }

    /**
     * Initialize undo/redo stack
     */
    this.configUndoRedoStack = () => {
      this.history = window.UndoRedoStack();
      const ctrZY = (e) => {
        const key = e.which || e.keyCode;

        if (e.ctrlKey && document.querySelectorAll('textarea:focus, input:focus').length === 0) {
          if (key === 90) this.undo()
          if (key === 89) this.redo()
        }
      }
      document.addEventListener('keydown', ctrZY)
    }

    /**
     * Initialize zoom events
     */
    this.initializeZoomEvents = () => {
      this.applyZoom = (zoom) => {
        this.canvas.setZoom(zoom)
        this.canvas.setWidth(this.canvas.originalW * this.canvas.getZoom())
        this.canvas.setHeight(this.canvas.originalH * this.canvas.getZoom())
      }

      // zoom out/in/reset (ctr + -/+/0)
      const keyZoom = (e) => zoomWithKeys(e, this.canvas, this.applyZoom)
      document.addEventListener('keydown', keyZoom)

      // zoom out/in with mouse
      const mouseZoom = (e) => zoomWithMouse(e, this.canvas, this.applyZoom)
      document.addEventListener('wheel', mouseZoom, {
        passive: false
      })
    }

    /**
     * Initialize image editor
     */
    this.init = () => {
      this.configUndoRedoStack();

      this.initializeToolbar();
      this.initializeMainPanel();

      this.initializeShapes();

      this.initializeFreeDrawSettings();
      this.initializeCanvasSettingPanel();
      this.initializeSelectionSettings();

      this.canvas = this.initializeCanvas();

      this.initializeLineDrawing(this.canvas);
      this.initializePathDrawing(this.canvas);
      this.initializeTextBoxDrawing(this.canvas);
      this.initializeUpload(this.canvas);
      this.initializeCopyPaste(this.canvas);
      this.initializeTipSection();

      this.initializeZoomEvents();

      this.extendHideShowToolPanel();
      this.extendNumberInput();
    }

    /**
     * Initialize main panel 
     */
    this.initializeMainPanel = () => {
      $(`${containerSelector}`).append('<div class="main-panel"></div>');
    }

    /**
     * Add features to hide/show tool panel
     */
    this.extendHideShowToolPanel = () => {
      $(`${this.containerSelector} .toolpanel .content`).each(function () {
        $(this).append(`<div class="hide-show-handler"></div>`)
      })

      $(`${this.containerSelector} .toolpanel .content .hide-show-handler`).click(function () {
        let panel = $(this).closest('.toolpanel');
        panel.toggleClass('closed');
      })
    }

    /**
     * Extend custom number input with increase/decrease button
     */
    this.extendNumberInput = () => {
      $(`${containerSelector} .decrease`).click(function () {
        let input = $(this).closest('.custom-number-input').find('input[type=number]')
        let step = input.attr('step');
        if (!step) step = 1;
        else {
          step = parseFloat(step);
        }
        let val = parseFloat(input.val());
        input.val((val - step).toFixed(step.countDecimals()));
        input.change();
      })
      $(`${containerSelector} .increase`).click(function () {
        let input = $(this).closest('.custom-number-input').find('input[type=number]')
        let step = input.attr('step');
        if (!step) step = 1;
        else {
          step = parseFloat(step);
        }
        let val = parseFloat(input.val());
        input.val((val + step).toFixed(step.countDecimals()));
        input.change();
      })
    }

    this.init();
  }

  window.ImageEditor = ImageEditor;
})();

/**
 * Canvas section management of image editor
 */
(function () {
  'use strict';
  var canvas = function () {
    try {
      $(`${this.containerSelector} .main-panel`).append(`<div class="canvas-holder" id="canvas-holder"><div class="content"><canvas id="c"></canvas></div></div>`);
      const fabricCanvas = new fabric.Canvas('c').setDimensions({
        width: 800,
        height: 600
      })

      fabricCanvas.originalW = fabricCanvas.width;
      fabricCanvas.originalH = fabricCanvas.height;

      // set up selection style
      fabric.Object.prototype.transparentCorners = false;
      fabric.Object.prototype.cornerStyle = 'circle';
      fabric.Object.prototype.borderColor = '#C00000';
      fabric.Object.prototype.cornerColor = '#C00000';
      fabric.Object.prototype.cornerStrokeColor = '#FFF';
      fabric.Object.prototype.padding = 0;

      // retrieve active selection to react state
      fabricCanvas.on('selection:created', (e) => this.setActiveSelection(e.target))
      fabricCanvas.on('selection:updated', (e) => this.setActiveSelection(e.target))
      fabricCanvas.on('selection:cleared', (e) => this.setActiveSelection(null))

      // snap to an angle on rotate if shift key is down
      fabricCanvas.on('object:rotating', (e) => {
        if (e.e.shiftKey) {
          e.target.snapAngle = 15;
        } else {
          e.target.snapAngle = false;
        }
      })

      fabricCanvas.on('object:modified', () => {
        console.log('trigger: modified')
        let currentState = this.canvas.toJSON();
        this.history.push(JSON.stringify(currentState));
      })

      const savedCanvas = saveInBrowser.load('canvasEditor');
      if (savedCanvas) {
        fabricCanvas.loadFromJSON(savedCanvas, fabricCanvas.renderAll.bind(fabricCanvas));
      }

      // move objects with arrow keys
      (() => document.addEventListener('keydown', (e) => {
        const key = e.which || e.keyCode;
        let activeObject;

        if (document.querySelectorAll('textarea:focus, input:focus').length > 0) return;

        if (key === 37 || key === 38 || key === 39 || key === 40) {
          e.preventDefault();
          activeObject = fabricCanvas.getActiveObject();
          if (!activeObject) {
            return;
          }
        }

        if (key === 37) {
          activeObject.left -= 1;
        } else if (key === 39) {
          activeObject.left += 1;
        } else if (key === 38) {
          activeObject.top -= 1;
        } else if (key === 40) {
          activeObject.top += 1;
        }

        if (key === 37 || key === 38 || key === 39 || key === 40) {
          activeObject.setCoords();
          fabricCanvas.renderAll();
          fabricCanvas.trigger('object:modified');
        }
      }))();

      // delete object on del key
      (() => {
        document.addEventListener('keydown', (e) => {
          const key = e.which || e.keyCode;
          if (
            key === 46 &&
            document.querySelectorAll('textarea:focus, input:focus').length === 0
          ) {

            fabricCanvas.getActiveObjects().forEach(obj => {
              fabricCanvas.remove(obj);
            });

            fabricCanvas.discardActiveObject().requestRenderAll();
            fabricCanvas.trigger('object:modified')
          }
        })
      })();

      setTimeout(() => {
        let currentState = fabricCanvas.toJSON();
        this.history.push(JSON.stringify(currentState));
      }, 1000);

      return fabricCanvas;
    } catch (_) {
      console.error("can't create canvas instance");
      return null;
    }
  }

  window.ImageEditor.prototype.initializeCanvas = canvas;
})();

/**
 * Define copy/paste actions on fabric js canvas
 */
(function () {
  'use strict';
  const copyPaste = (canvas) => {

    // copy
    document.addEventListener('copy', (e) => {
      if (!canvas.getActiveObject()) return

      // copy image as dataUrl
      if (canvas.getActiveObject().type === 'image') {
        e.preventDefault()

        e.clipboardData.setData('text/plain', canvas.getActiveObject().toDataURL())
      }


      // if selection is not an image, copy as JSON
      if (canvas.getActiveObject().type !== 'image') {
        e.preventDefault()
        canvas.getActiveObject().clone((cloned) => {
          e.clipboardData.setData('text/plain', JSON.stringify(cloned.toJSON()))
        })
      }
    })

    // JSON string validator
    const isJSONObjectString = (s) => {
      try {
        const o = JSON.parse(s);
        return !!o && (typeof o === 'object') && !Array.isArray(o)
      } catch {
        return false
      }
    }

    // base64 validator
    const isBase64String = (str) => {
      try {
        str = str.split('base64,').pop()
        window.atob(str)
        return true
      } catch (e) {
        return false
      }
    }

    // paste
    document.addEventListener('paste', (e) => {
      let pasteTextData = e.clipboardData.getData('text')

      // check if base64 image
      if (pasteTextData && isBase64String(pasteTextData)) {
        fabric.Image.fromURL(pasteTextData, (img) => {
          img.set({
            left: 0,
            top: 0
          })
          img.scaleToHeight(100)
          img.scaleToWidth(100)
          canvas.add(img)
          canvas.setActiveObject(img)
          canvas.trigger('object:modified')
        })

        return
      }

      // check if there's an image in clipboard items
      if (e.clipboardData.items.length > 0) {
        for (let i = 0; i < e.clipboardData.items.length; i++) {
          if (e.clipboardData.items[i].type.indexOf('image') === 0) {
            let blob = e.clipboardData.items[i].getAsFile()
            if (blob !== null) {
              let reader = new FileReader()
              reader.onload = (f) => {
                fabric.Image.fromURL(f.target.result, (img) => {
                  img.set({
                    left: 0,
                    top: 0
                  })
                  img.scaleToHeight(100)
                  img.scaleToWidth(100)
                  canvas.add(img)
                  canvas.setActiveObject(img)
                  canvas.trigger('object:modified')
                })
              }
              reader.readAsDataURL(blob)
            }
          }
        }
      }

      // check if JSON and type is valid
      let validTypes = ['rect', 'circle', 'line', 'path', 'polygon', 'polyline', 'textbox', 'group']
      if (isJSONObjectString(pasteTextData)) {
        let obj = JSON.parse(pasteTextData)
        if (!validTypes.includes(obj.type)) return

        // insert and select
        fabric.util.enlivenObjects([obj], function (objects) {
          objects.forEach(function (o) {
            o.set({
              left: 0,
              top: 0
            })
            canvas.add(o)
            o.setCoords()
            canvas.setActiveObject(o)
          })
          canvas.renderAll()
          canvas.trigger('object:modified')
        })
      }
    })
  }

  window.ImageEditor.prototype.initializeCopyPaste = copyPaste;
})();

/**
 * initialize canvas setting panel
 */
(function () {
  'use strict';
  var canvasSettings = function () {
    const _self = this;
    $(`${this.containerSelector} .main-panel`).append(`<div class="toolpanel" id="background-panel"><div class="content"><p class="title">Canvas Settings</p></div></div>`);

    // set dimension section
    (() => {
      $(`${this.containerSelector} .toolpanel#background-panel .content`).append(`
      <div class="canvas-size-setting">
        <p>Canvas Size</p>
        <div class="input-container">
          <label>Width</label>
          <div class="custom-number-input">
          <button class="decrease">-</button>
          <input type="number" min="100" id="input-width" value="640"/>
          <button class="increase">+</button>
          </div>
        </div>
        <div class="input-container">
          <label>Height</label>
          <div class="custom-number-input">
          <button class="decrease">-</button>
          <input type="number" min="100" id="input-height" value="480"/>
          <button class="increase">+</button>
          </div>
        </div>
      </div>
    `);

      var setDimension = () => {
        try {
          let width = $(`${this.containerSelector} .toolpanel#background-panel .content #input-width`).val();
          let height = $(`${this.containerSelector} .toolpanel#background-panel .content #input-height`).val();
          _self.canvas.setWidth(width)
          _self.canvas.originalW = width
          _self.canvas.setHeight(height)
          _self.canvas.originalH = height
          _self.canvas.renderAll()
          _self.canvas.trigger('object:modified')
        } catch (_) {}
      }

      $(`${this.containerSelector} .toolpanel#background-panel .content #input-width`).change(setDimension)
      $(`${this.containerSelector} .toolpanel#background-panel .content #input-height`).change(setDimension)
    })();
    // end set dimension section

    // background color
    (() => {
      $(`${this.containerSelector} .toolpanel#background-panel .content`).append(`
      <div class="color-settings">
        <div class="tab-container">
          <div class="tabs">
            <div class="tab-label" data-value="color-fill">Color Fill</div>
            <div class="tab-label" data-value="gradient-fill">Gradient Fill</div>
          </div>
          <div class="tab-content" data-value="color-fill">
            <input id="color-picker" value='black'/><br>
          </div>
          <div class="tab-content" data-value="gradient-fill">
            <div id="gradient-picker"></div>

            <div class="gradient-orientation-container">
              <div class="input-container">
                <label>Orientation</label>
                <select id="select-orientation">
                  <option value="linear">Linear</option>
                  <option value="radial">Radial</option>
                </select>
              </div>
              <div id="angle-input-container" class="input-container">
                <label>Angle</label>
                <div class="custom-number-input">
                  <button class="decrease">-</button>
                  <input type="number" min="0" max="360" value="0" id="input-angle">
                  <button class="increase">+</button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    `)

      $(`${this.containerSelector} .toolpanel#background-panel .content .tab-label`).click(function () {
        $(`${_self.containerSelector} .toolpanel#background-panel .content .tab-label`).removeClass('active');
        $(this).addClass('active');
        let target = $(this).data('value');
        $(this).closest('.tab-container').find('.tab-content').hide();
        $(this).closest('.tab-container').find(`.tab-content[data-value=${target}]`).show();

        if (target === 'color-fill') {
          let color = $(`${_self.containerSelector} .toolpanel#background-panel .content #color-picker`).val();
          try {
            _self.canvas.backgroundColor = color;
            _self.canvas.renderAll();
          } catch (_) {
            console.log("can't update background color")
          }
        } else {
          updateGradientFill();
        }
      })

      $(`${this.containerSelector} .toolpanel#background-panel .content .tab-label[data-value=color-fill]`).click();

      $(`${this.containerSelector} .toolpanel#background-panel .content #color-picker`).spectrum({
        flat: true,
        showPalette: false,
        showButtons: false,
        type: "color",
        showInput: "true",
        allowEmpty: "false",
        move: function (color) {
          let hex = 'transparent';
          color && (hex = color.toRgbString()); // #ff0000
          _self.canvas.backgroundColor = hex;
          _self.canvas.renderAll();
        }
      });

      const gp = new Grapick({
        el: `${this.containerSelector} .toolpanel#background-panel .content #gradient-picker`,
        colorEl: '<input id="colorpicker"/>' // I'll use this for the custom color picker
      });

      gp.setColorPicker(handler => {
        const el = handler.getEl().querySelector('#colorpicker');
        $(el).spectrum({
          showPalette: false,
          showButtons: false,
          type: "color",
          showInput: "true",
          allowEmpty: "false",
          color: handler.getColor(),
          showAlpha: true,
          change(color) {
            handler.setColor(color.toRgbString());
          },
          move(color) {
            handler.setColor(color.toRgbString(), 0);
          }
        });
      });

      gp.addHandler(0, 'red');
      gp.addHandler(100, 'blue');

      const updateGradientFill = () => {
        let stops = gp.getHandlers();
        let orientation = $(`${this.containerSelector} .toolpanel#background-panel .content .gradient-orientation-container #select-orientation`).val();
        let angle = parseInt($(`${this.containerSelector} .toolpanel#background-panel .content .gradient-orientation-container #input-angle`).val());

        let gradient = generateFabricGradientFromColorStops(stops, _self.canvas.width, _self.canvas.height, orientation, angle);
        _self.canvas.setBackgroundColor(gradient)
        _self.canvas.renderAll()
      }

      // Do stuff on change of the gradient
      gp.on('change', complete => {
        updateGradientFill();
      })

      $(`${this.containerSelector} .toolpanel#background-panel .content .gradient-orientation-container #select-orientation`).change(function () {
        let type = $(this).val();
        if (type === 'radial') {
          $(this).closest('.gradient-orientation-container').find('#angle-input-container').hide();
        } else {
          $(this).closest('.gradient-orientation-container').find('#angle-input-container').show();
        }
        updateGradientFill();
      })

      $(`${this.containerSelector} .toolpanel#background-panel .content .gradient-orientation-container #input-angle`).change(function () {
        updateGradientFill();
      })
    })();
  }

  window.ImageEditor.prototype.initializeCanvasSettingPanel = canvasSettings;
})();

/**
 * Define action to draw line by mouse actions
 */
(function () {
  var lineDrawing = function (fabricCanvas) {
    let isDrawingLine = false,
      lineToDraw, pointer, pointerPoints

    fabricCanvas.on('mouse:down', (o) => {
      if (!fabricCanvas.isDrawingLineMode) return

      isDrawingLine = true
      pointer = fabricCanvas.getPointer(o.e)
      pointerPoints = [pointer.x, pointer.y, pointer.x, pointer.y]

      lineToDraw = new fabric.Line(pointerPoints, {
        strokeWidth: 2,
        stroke: '#000000'
      });
      lineToDraw.selectable = false
      lineToDraw.evented = false
      lineToDraw.strokeUniform = true
      fabricCanvas.add(lineToDraw)
    });

    fabricCanvas.on('mouse:move', (o) => {
      if (!isDrawingLine) return

      pointer = fabricCanvas.getPointer(o.e)

      if (o.e.shiftKey) {
        // calc angle
        let startX = pointerPoints[0]
        let startY = pointerPoints[1]
        let x2 = pointer.x - startX
        let y2 = pointer.y - startY
        let r = Math.sqrt(x2 * x2 + y2 * y2)
        let angle = (Math.atan2(y2, x2) / Math.PI * 180)

        angle = parseInt(((angle + 7.5) % 360) / 15) * 15

        let cosx = r * Math.cos(angle * Math.PI / 180)
        let sinx = r * Math.sin(angle * Math.PI / 180)

        lineToDraw.set({
          x2: cosx + startX,
          y2: sinx + startY
        })

      } else {
        lineToDraw.set({
          x2: pointer.x,
          y2: pointer.y
        })
      }

      fabricCanvas.renderAll()

    });

    fabricCanvas.on('mouse:up', () => {
      if (!isDrawingLine) return

      lineToDraw.setCoords()
      isDrawingLine = false
      fabricCanvas.trigger('object:modified')
    });
  }

  window.ImageEditor.prototype.initializeLineDrawing = lineDrawing;
})();

/**
 * Define action to draw path by mouse action
 */
(function () {
  const inRange = (radius, cursorX, cursorY, targetX, targetY) => {
    if (
      Math.abs(cursorX - targetX) <= radius &&
      Math.abs(cursorY - targetY) <= radius
    ) {
      return true
    }

    return false
  }

  const pathDrawing = (fabricCanvas) => {

    let isDrawingPath = false,
      pathToDraw,
      pointer,
      updatedPath,
      isMouseDown = false,
      isDrawingCurve = false,
      rememberX, rememberY


    fabricCanvas.on('mouse:down', (o) => {
      if (!fabricCanvas.isDrawingPathMode) return

      isMouseDown = true
      isDrawingPath = true
      pointer = fabricCanvas.getPointer(o.e)


      // if first point, no extras, just place the point
      if (!pathToDraw) {
        pathToDraw = new fabric.Path(`M${pointer.x} ${pointer.y} L${pointer.x} ${pointer.y}`, {
          strokeWidth: 2,
          stroke: '#000000',
          fill: false
        })
        pathToDraw.selectable = false
        pathToDraw.evented = false
        pathToDraw.strokeUniform = true
        fabricCanvas.add(pathToDraw)

        return
      }

      // not the first point, add a new line
      if (pathToDraw) {
        pathToDraw.path.push(['L', pointer.x, pointer.y])

        // recalc path dimensions
        let dims = pathToDraw._calcDimensions()
        pathToDraw.set({
          width: dims.width,
          height: dims.height,
          left: dims.left,
          top: dims.top,
          pathOffset: {
            x: dims.width / 2 + dims.left,
            y: dims.height / 2 + dims.top
          },
          dirty: true
        })
        pathToDraw.setCoords()
        fabricCanvas.renderAll()

        return
      }
    });



    fabricCanvas.on('mouse:move', (o) => {

      if (!fabricCanvas.isDrawingPathMode) return

      if (!isDrawingPath) return

      // update the last path command as we move the mouse
      pointer = fabricCanvas.getPointer(o.e)

      if (!isDrawingCurve) {
        updatedPath = ['L', pointer.x, pointer.y]
      }

      pathToDraw.path.pop()


      // shift key is down, jump angles
      if (o.e.shiftKey && !isDrawingCurve) {
        // last fix, placed point
        let lastPoint = [...pathToDraw.path].pop()
        let startX = lastPoint[1]
        let startY = lastPoint[2]

        let x2 = pointer.x - startX
        let y2 = pointer.y - startY
        let r = Math.sqrt(x2 * x2 + y2 * y2)
        let angle = (Math.atan2(y2, x2) / Math.PI * 180)

        angle = parseInt(((angle + 7.5) % 360) / 15) * 15

        let cosx = r * Math.cos(angle * Math.PI / 180)
        let sinx = r * Math.sin(angle * Math.PI / 180)

        updatedPath[1] = cosx + startX
        updatedPath[2] = sinx + startY
      }


      // detect and snap to closest line if within range
      if (pathToDraw.path.length > 1 && !isDrawingCurve) {
        // foreach all points, except last
        let snapPoints = [...pathToDraw.path]
        snapPoints.pop()
        for (let p of snapPoints) {
          // line
          if ((p[0] === 'L' || p[0] === 'M') && inRange(10, pointer.x, pointer.y, p[1], p[2])) {
            updatedPath[1] = p[1]
            updatedPath[2] = p[2]
            break
          }

          // curve
          if (p[0] === 'Q' && inRange(10, pointer.x, pointer.y, p[3], p[4])) {
            updatedPath[1] = p[3]
            updatedPath[2] = p[4]
            break
          }

        }
      }

      // curve creating
      if (isMouseDown) {

        if (!isDrawingCurve && pathToDraw.path.length > 1) {

          isDrawingCurve = true

          // get last path position and remove last path so we can update it
          let lastPath = pathToDraw.path.pop()

          if (lastPath[0] === 'Q') {
            updatedPath = ['Q', lastPath[3], lastPath[4], lastPath[3], lastPath[4]]
            rememberX = lastPath[3]
            rememberY = lastPath[4]
          } else {
            updatedPath = ['Q', lastPath[1], lastPath[2], lastPath[1], lastPath[2]]
            rememberX = lastPath[1]
            rememberY = lastPath[2]
          }

        } else if (isDrawingCurve) {

          // detect mouse move and calc Q position
          let mouseMoveX = pointer.x - updatedPath[3]
          let mouseMoveY = pointer.y - updatedPath[4]

          updatedPath = [
            'Q',
            rememberX - mouseMoveX,
            rememberY - mouseMoveY,
            rememberX,
            rememberY
          ]

        }

      }

      // add new path
      pathToDraw.path.push(updatedPath)

      // recalc path dimensions
      let dims = pathToDraw._calcDimensions();
      pathToDraw.set({
        width: dims.width,
        height: dims.height,
        left: dims.left,
        top: dims.top,
        pathOffset: {
          x: dims.width / 2 + dims.left,
          y: dims.height / 2 + dims.top
        },
        dirty: true
      })
      fabricCanvas.renderAll()

    })

    fabricCanvas.on('mouse:up', (o) => {
      if (!fabricCanvas.isDrawingPathMode) {
        isMouseDown = false
        isDrawingCurve = false
        return
      }

      isMouseDown = false

      if (isDrawingCurve) {
        // place current curve by starting a new line
        pointer = fabricCanvas.getPointer(o.e)
        pathToDraw.path.push(['L', pointer.x, pointer.y])

        // recalc path dimensions
        let dims = pathToDraw._calcDimensions()
        pathToDraw.set({
          width: dims.width,
          height: dims.height,
          left: dims.left,
          top: dims.top,
          pathOffset: {
            x: dims.width / 2 + dims.left,
            y: dims.height / 2 + dims.top
          },
          dirty: true
        })
        pathToDraw.setCoords()
        fabricCanvas.renderAll()
      }

      isDrawingCurve = false

    })

    // cancel drawing, remove last line
    const cancelDrawing = () => {
      // remove last line
      pathToDraw.path.pop()

      if (pathToDraw.path.length > 1) {

        let dims = pathToDraw._calcDimensions();
        pathToDraw.set({
          width: dims.width,
          height: dims.height,
          left: dims.left,
          top: dims.top,
          pathOffset: {
            x: dims.width / 2 + dims.left,
            y: dims.height / 2 + dims.top
          },
          dirty: true
        })

      } else {
        // if there is no line, just the starting point then remove
        fabricCanvas.remove(pathToDraw);
      }

      fabricCanvas.renderAll()
      fabricCanvas.trigger('object:modified')

      pathToDraw = null
      isDrawingPath = false
    }

    // cancel drawing on esc key or outside click
    document.addEventListener('keydown', (e) => {
      if (!isDrawingPath) return

      const key = e.which || e.keyCode;
      if (key === 27) cancelDrawing()
    })

    document.addEventListener('mousedown', (e) => {
      if (!isDrawingPath) return

      if (!document.querySelector('.canvas-container').contains(e.target)) {
        cancelDrawing()
      }
    })

  }

  window.ImageEditor.prototype.initializePathDrawing = pathDrawing;
})();

/**
 * Define action to draw text
 */
(function () {
  const textBoxDrawing = function (fabricCanvas) {

    let isDrawingText = false,
      textboxRect, origX, origY, pointer;


    fabricCanvas.on('mouse:down', (o) => {
      if (!fabricCanvas.isDrawingTextMode) return;

      isDrawingText = true;
      pointer = fabricCanvas.getPointer(o.e);
      origX = pointer.x;
      origY = pointer.y;
      textboxRect = new fabric.Rect({
        left: origX,
        top: origY,
        width: pointer.x - origX,
        height: pointer.y - origY,
        strokeWidth: 1,
        stroke: '#C00000',
        fill: 'rgba(192, 0, 0, 0.2)',
        transparentCorners: false
      });
      fabricCanvas.add(textboxRect);
    });


    fabricCanvas.on('mouse:move', (o) => {
      if (!isDrawingText) return;

      pointer = fabricCanvas.getPointer(o.e);

      if (origX > pointer.x) {
        textboxRect.set({
          left: Math.abs(pointer.x)
        });
      }

      if (origY > pointer.y) {
        textboxRect.set({
          top: Math.abs(pointer.y)
        });
      }

      textboxRect.set({
        width: Math.abs(origX - pointer.x)
      });
      textboxRect.set({
        height: Math.abs(origY - pointer.y)
      });

      fabricCanvas.renderAll();
    });


    fabricCanvas.on('mouse:up', () => {
      if (!isDrawingText) return;

      isDrawingText = false;

      // get final rect coords and replace it with textbox
      let textbox = new fabric.Textbox('Your text goes here...', {
        left: textboxRect.left,
        top: textboxRect.top,
        width: textboxRect.width < 80 ? 80 : textboxRect.width,
        fontSize: 18,
        fontFamily: "'Open Sans', sans-serif"
      });
      fabricCanvas.remove(textboxRect);
      fabricCanvas.add(textbox).setActiveObject(textbox)
      textbox.setControlsVisibility({
        'mb': false
      });
      fabricCanvas.trigger('object:modified')
    });

  }

  window.ImageEditor.prototype.initializeTextBoxDrawing = textBoxDrawing;
})();

/**
 * Define action to pen draw by mouse action
 */
(function () {
  'use strict';

  var freeDrawSettings = function () {
    let width = 1;
    let style = 'pencil';
    let color = 'black';

    const _self = this;
    $(`${this.containerSelector} .main-panel`).append(`<div class="toolpanel" id="draw-panel"><div class="content"><p class="title">Free Draw</p></div></div>`);

    // set dimension section
    $(`${this.containerSelector} .toolpanel#draw-panel .content`).append(`
      <div>
        <div class="input-container">
          <label>Brush Width</label>
          <div class="custom-number-input">
          <button class="decrease">-</button>
          <input type="number" min="1" value="1" id="input-brush-width"/>
          <button class="increase">+</button>
          </div>
        </div>
        <div class="input-container">
          <label>Brush Type</label>
          <select id="input-brush-type">
            <option value="pencil" selected>Pencil</option>
            <option value="circle">Circle</option>
            <option value="spray">Spray</option>
          </select>
        </div>
        <div class="input-container">
          <label>Brush Color</label>
          <input id="color-picker" value='black'/>
        </div>
      </div>
    `);

    let updateBrush = () => {
      try {
        switch (style) {
          case 'circle':
            _self.canvas.freeDrawingBrush = new fabric.CircleBrush(_self.canvas)
            break

          case 'spray':
            _self.canvas.freeDrawingBrush = new fabric.SprayBrush(_self.canvas)
            break

          default:
            _self.canvas.freeDrawingBrush = new fabric.PencilBrush(_self.canvas)
            break
        }

        _self.canvas.freeDrawingBrush.width = width;
        _self.canvas.freeDrawingBrush.color = color;

      } catch (_) {}
    }

    $(`${this.containerSelector} .toolpanel#draw-panel .content #input-brush-width`).change(function () {
      try {
        width = parseInt($(this).val());
        updateBrush();
      } catch (_) {}
    })

    $(`${this.containerSelector} .toolpanel#draw-panel .content #input-brush-type`).change(function () {
      style = $(this).val();
      updateBrush();
    })

    $(`${this.containerSelector} .toolpanel#draw-panel .content #color-picker`).spectrum({
      type: "color",
      showInput: "true",
      showInitial: "true",
      allowEmpty: "false",
    });

    $(`${this.containerSelector} .toolpanel#draw-panel .content #color-picker`).change(function () {
      try {
        color = $(this).val();
        updateBrush();
      } catch (_) {}
    })
  }

  window.ImageEditor.prototype.initializeFreeDrawSettings = freeDrawSettings;
})();

/**
 * initialize selection setting panel
 */
(function () {
  'use strict';
  const BorderStyleList = [{
    value: {
      strokeDashArray: [],
      strokeLineCap: 'butt'
    },
    label: "Stroke"
  }, {
    value: {
      strokeDashArray: [1, 10],
      strokeLineCap: 'butt'
    },
    label: 'Dash-1'
  }, {
    value: {
      strokeDashArray: [1, 10],
      strokeLineCap: 'round'
    },
    label: 'Dash-2'
  }, {
    value: {
      strokeDashArray: [15, 15],
      strokeLineCap: 'square'
    },
    label: 'Dash-3'
  }, {
    value: {
      strokeDashArray: [15, 15],
      strokeLineCap: 'round'
    },
    label: 'Dash-4'
  }, {
    value: {
      strokeDashArray: [25, 25],
      strokeLineCap: 'square'
    },
    label: 'Dash-5',
  }, {
    value: {
      strokeDashArray: [25, 25],
      strokeLineCap: 'round'
    },
    label: 'Dash-6',
  }, {
    value: {
      strokeDashArray: [1, 8, 16, 8, 1, 20],
      strokeLineCap: 'square'
    },
    label: 'Dash-7',
  }, {
    value: {
      strokeDashArray: [1, 8, 16, 8, 1, 20],
      strokeLineCap: 'round'
    },
    label: 'Dash-8',
  }]
  const AlignmentButtonList = [{
    pos: 'left',
    icon: `<svg enable-background="new 0 0 100 100" viewBox="0 0 100 125" xml:space="preserve"><g transform="translate(1.4305e-6 -17.438)" stroke-width="1.2346"><rect x="14.815" y="48.16" width="85.185" height="24.691"></rect><rect x="14.815" y="87.025" width="45.679" height="24.691"></rect><rect y="34.877" width="8.642" height="90.123"></rect></g></svg>`
  }, {
    pos: 'center-h',
    icon: `<svg enable-background="new 0 0 100 100" viewBox="0 0 100 125" xml:space="preserve"><g stroke-width="1.2346"><rect x="7.4075" y="30.722" width="85.185" height="24.691"></rect><rect x="27.16" y="69.587" width="45.679" height="24.691"></rect><rect x="45.679" y="17.439" width="8.642" height="90.123"></rect></g></svg>`,
  }, {
    pos: 'right',
    icon: `<svg enable-background="new 0 0 100 100" viewBox="0 0 100 125" xml:space="preserve"><g transform="translate(1.4305e-6 -17.438)" stroke-width="1.2346"><rect transform="scale(-1,1)" x="-85.185" y="48.16" width="85.185" height="24.691"></rect><rect transform="scale(-1,1)" x="-85.185" y="87.025" width="45.679" height="24.691"></rect><rect transform="scale(-1,1)" x="-100" y="34.877" width="8.642" height="90.123"></rect></g></svg>`,
  }, {
    pos: 'top',
    icon: `<svg enable-background="new 0 0 100 100" viewBox="0 0 100 125" xml:space="preserve"><g transform="translate(1.4305e-6 -17.438)"><g transform="matrix(0 -1 -1 0 129.94 129.94)" stroke-width="1.2346"><rect transform="scale(-1,1)" x="-85.185" y="48.16" width="85.185" height="24.691"></rect><rect transform="scale(-1,1)" x="-85.185" y="87.025" width="45.679" height="24.691"></rect><rect transform="scale(-1,1)" x="-100" y="34.877" width="8.642" height="90.123"></rect></g></g></svg>`,
  }, {
    pos: 'center-v',
    icon: `<svg enable-background="new 0 0 100 100" viewBox="0 0 100 125" xml:space="preserve"><g stroke-width="1.2346"><rect transform="rotate(90)" x="19.908" y="-81.779" width="85.185" height="24.691"></rect><rect transform="rotate(90)" x="39.66" y="-42.913" width="45.679" height="24.691"></rect><rect transform="rotate(90)" x="58.179" y="-95.062" width="8.642" height="90.123"></rect></g></svg>`
  }, {
    pos: 'bottom',
    icon: `<svg enable-background="new 0 0 100 100" viewBox="0 0 100 125" xml:space="preserve"><g transform="translate(1.4305e-6 -17.438)"><g transform="rotate(90 50 79.938)" stroke-width="1.2346"><rect transform="scale(-1,1)" x="-85.185" y="48.16" width="85.185" height="24.691"></rect><rect transform="scale(-1,1)" x="-85.185" y="87.025" width="45.679" height="24.691"></rect><rect transform="scale(-1,1)" x="-100" y="34.877" width="8.642" height="90.123"></rect></g></g></svg>`
  }]
  var selectionSettings = function () {
    const _self = this;
    $(`${this.containerSelector} .main-panel`).append(`<div class="toolpanel" id="select-panel"><div class="content"><p class="title">Selection Settings</p></div></div>`);

    // font section
    (() => {
      $(`${this.containerSelector} .toolpanel#select-panel .content`).append(`
        <div class="text-section">
          <h4>Font Style</h4>
          <div class="style">
            <button id="bold"><svg id="Capa_1" x="0px" y="0px" viewBox="-70 -70 450 450" xml:space="preserve"><path d="M218.133,144.853c20.587-14.4,35.2-37.653,35.2-59.52C253.333,37.227,216.107,0,168,0H34.667v298.667h150.187 c44.693,0,79.147-36.267,79.147-80.853C264,185.387,245.547,157.76,218.133,144.853z M98.667,53.333h64c17.707,0,32,14.293,32,32 s-14.293,32-32,32h-64V53.333z M173.333,245.333H98.667v-64h74.667c17.707,0,32,14.293,32,32S191.04,245.333,173.333,245.333z"></path></svg></button>
            <button id="italic"><svg id="Capa_1" x="0px" y="0px" viewBox="-70 -70 450 450" xml:space="preserve"><polygon points="106.667,0 106.667,64 153.92,64 80.747,234.667 21.333,234.667 21.333,298.667 192,298.667 192,234.667 144.747,234.667 217.92,64 277.333,64 277.333,0  "></polygon></svg></button>
            <button id="underline"><svg id="Capa_1" x="0px" y="0px" viewBox="-70 -70 450 450" xml:space="preserve"><path d="M192,298.667c70.72,0,128-57.28,128-128V0h-53.333v170.667c0,41.28-33.387,74.667-74.667,74.667 s-74.667-33.387-74.667-74.667V0H64v170.667C64,241.387,121.28,298.667,192,298.667z"></path><rect x="42.667" y="341.333" width="298.667" height="42.667"></rect></svg></button>
            <button id="linethrough"><svg id="Capa_1" x="0px" y="0px" viewBox="-70 -70 450 450" xml:space="preserve"><polygon points="149.333,160 234.667,160 234.667,96 341.333,96 341.333,32 42.667,32 42.667,96 149.333,96"></polygon><rect x="149.333" y="288" width="85.333" height="64"></rect><rect x="0" y="202.667" width="384" height="42.667"></rect></svg></button>
            <button id="subscript"><svg id="Capa_1" x="0px" y="0px" viewBox="0 0 512 512" xml:space="preserve"><path d="M248.257,256l103.986-103.758c2.777-2.771,4.337-6.532,4.337-10.455c0-3.923-1.561-7.684-4.337-10.455l-49.057-48.948 c-5.765-5.753-15.098-5.753-20.863,0L178.29,186.188L74.258,82.384c-5.764-5.751-15.098-5.752-20.863,0L4.337,131.333 C1.561,134.103,0,137.865,0,141.788c0,3.923,1.561,7.684,4.337,10.455L108.324,256L4.337,359.758 C1.561,362.528,0,366.29,0,370.212c0,3.923,1.561,7.684,4.337,10.455l49.057,48.948c5.765,5.753,15.098,5.753,20.863,0 l104.033-103.804l104.032,103.804c2.883,2.876,6.657,4.315,10.432,4.315s7.549-1.438,10.432-4.315l49.056-48.948 c2.777-2.771,4.337-6.532,4.337-10.455c0-3.923-1.561-7.684-4.337-10.455L248.257,256z"></path><path d="M497.231,384.331h-44.973l35.508-31.887c14.878-13.36,20.056-34.18,13.192-53.04 c-6.874-18.89-23.565-31.044-43.561-31.717c-0.639-0.021-1.283-0.032-1.928-0.032c-31.171,0-56.531,25.318-56.531,56.439 c0,8.157,6.613,14.769,14.769,14.769c8.156,0,14.769-6.613,14.769-14.769c0-14.833,12.109-26.901,26.992-26.901 c0.316,0,0.631,0.005,0.937,0.016c11.573,0.39,15.78,9.511,16.795,12.297c2.163,5.946,1.942,14.574-5.171,20.962l-64.19,57.643 c-4.552,4.088-6.112,10.56-3.923,16.273c2.189,5.714,7.673,9.486,13.792,9.486h83.523c8.157,0,14.769-6.613,14.769-14.769 S505.387,384.331,497.231,384.331z"></path></svg></button>
            <button id="superscript"><svg id="Capa_1" x="0px" y="0px" viewBox="0 0 512 512" xml:space="preserve"><path d="M248.257,259.854l103.986-103.758c2.777-2.771,4.337-6.532,4.337-10.455c0-3.923-1.561-7.684-4.337-10.455l-49.057-48.948 c-5.765-5.753-15.098-5.753-20.863,0L178.29,190.042L74.258,86.238c-5.764-5.751-15.099-5.752-20.863,0L4.337,135.187 C1.561,137.958,0,141.719,0,145.642s1.561,7.684,4.337,10.455l103.986,103.758L4.337,363.612C1.561,366.383,0,370.145,0,374.067 c0,3.922,1.561,7.684,4.337,10.455l49.057,48.948c5.765,5.753,15.098,5.753,20.863,0l104.033-103.804l104.032,103.804 c2.883,2.876,6.657,4.315,10.432,4.315s7.549-1.438,10.432-4.315l49.056-48.948c2.777-2.771,4.337-6.532,4.337-10.455 s-1.561-7.684-4.337-10.455L248.257,259.854z"></path><path d="M497.231,190.893h-44.973l35.508-31.887c14.878-13.36,20.056-34.18,13.192-53.04 c-6.874-18.89-23.565-31.044-43.561-31.717c-0.639-0.021-1.283-0.032-1.928-0.032c-31.171,0-56.531,25.318-56.531,56.439 c0,8.157,6.613,14.769,14.769,14.769c8.156,0,14.769-6.613,14.769-14.769c0-14.833,12.109-26.901,26.992-26.901 c0.316,0,0.631,0.005,0.937,0.016c11.573,0.39,15.78,9.511,16.795,12.297c2.163,5.946,1.942,14.574-5.171,20.962l-64.19,57.643 c-4.552,4.088-6.112,10.56-3.923,16.273c2.189,5.714,7.673,9.486,13.792,9.486h83.523c8.157,0,14.769-6.613,14.769-14.769 S505.387,190.893,497.231,190.893z"></path></svg></button>
          </div>
          <div class="family">
            <div class="input-container">
            <label>Font Family</label>
            <select id="font-family">
              <option value=""></option>
              <option value="'Open Sans', sans-serif">Open Sans</option>
              <option value="'Oswald', sans-serif">Oswald</option>
              <option value="'Playfair Display', serif">Playfair Display</option>
              <option value="'Cormorant Garamond', serif">Cormorant Garamond</option>
              <option value="Impact, Charcoal, sans-serif">Impact</option>
              <option value="'Lucida Console', Monaco, monospace">Lucida Console</option>
              <option value="'Comic Sans MS', 'Comic Sans', cursive, sans-serif">Comic Sans</option>
              <option value="'Dancing Script', cursive">Dancing Script</option>
              <option value="'Indie Flower', cursive">Indie Flower</option>
              <option value="'Amatic SC', cursive">Amatic SC</option>
              <option value="'Permanent Marker', cursive">Permanent Marker</option>
            </select>
            </div>
          </div>
          <div class="sizes">
            <div class="input-container"><label>Font Size</label>
              <div class="custom-number-input">
              <button class="decrease">-</button>
              <input type="number" min="1" value="20" id="fontSize">
              <button class="increase">+</button>
              </div>
            </div>
            <div class="input-container"><label>Line Height</label>
              <div class="custom-number-input">
              <button class="decrease">-</button>
              <input type="number" min="0" max="3" value="1" step="0.1" id="lineHeight">
              <button class="increase">+</button>
              </div>
            </div>
            <div class="input-container"><label>Letter Spacing</label>
              <div class="custom-number-input">
              <button class="decrease">-</button>
              <input type="number" min="0" max="2000" step="100" value="0" id="charSpacing">
              <button class="increase">+</button>
              </div>
            </div>
            </p>
          </div>
          <div class="align">
            <div class="input-container">
            <label>Text Alignment</label>
            <select id="text-align">
              <option value="left">Left</option>
              <option value="center">Center</option>
              <option value="right">Right</option>
              <option value="justify">Justify</option>
            </select>
            </div>
          </div>
          <div class="color">
            <div class="input-container">
            <label>Text Color</label>
            <input id="color-picker" value="black">
            </div>
          </div>
          <hr>
        </div>
      `);
      $(`${this.containerSelector} .toolpanel#select-panel .style button`).click(function () {
        let type = $(this).attr('id');
        switch (type) {
          case 'bold':
            setActiveFontStyle(_self.activeSelection, 'fontWeight', getActiveFontStyle(_self.activeSelection, 'fontWeight') === 'bold' ? '' : 'bold')
            break;
          case 'italic':
            setActiveFontStyle(_self.activeSelection, 'fontStyle', getActiveFontStyle(_self.activeSelection, 'fontStyle') === 'italic' ? '' : 'italic')
            break;
          case 'underline':
            setActiveFontStyle(_self.activeSelection, 'underline', !getActiveFontStyle(_self.activeSelection, 'underline'))
            break;
          case 'linethrough':
            setActiveFontStyle(_self.activeSelection, 'linethrough', !getActiveFontStyle(_self.activeSelection, 'linethrough'))
            break;
          case 'subscript':
            if (getActiveFontStyle(_self.activeSelection, 'deltaY') > 0) {
              setActiveFontStyle(_self.activeSelection, 'fontSize', undefined)
              setActiveFontStyle(_self.activeSelection, 'deltaY', undefined)
            } else {
              _self.activeSelection.setSubscript()
              _self.canvas.renderAll()
            }
            break;
          case 'superscript':
            if (getActiveFontStyle(_self.activeSelection, 'deltaY') < 0) {
              setActiveFontStyle(_self.activeSelection, 'fontSize', undefined)
              setActiveFontStyle(_self.activeSelection, 'deltaY', undefined)
            } else {
              _self.activeSelection.setSuperscript()
              _self.canvas.renderAll()
            }
            break;
          default:
            break;
        }
        _self.canvas.renderAll(), _self.canvas.trigger('object:modified');
      })

      $(`${this.containerSelector} .toolpanel#select-panel .family #font-family`).change(function () {
        let family = $(this).val();
        setActiveFontStyle(_self.activeSelection, 'fontFamily', family)
        _self.canvas.renderAll(), _self.canvas.trigger('object:modified');
      })

      $(`${this.containerSelector} .toolpanel#select-panel .sizes input`).change(function () {
        let value = parseFloat($(this).val());
        let type = $(this).attr('id');
        setActiveFontStyle(_self.activeSelection, type, value);
        _self.canvas.renderAll(), _self.canvas.trigger('object:modified');
      })

      $(`${this.containerSelector} .toolpanel#select-panel .align #text-align`).change(function () {
        let mode = $(this).val();
        setActiveFontStyle(_self.activeSelection, 'textAlign', mode);
        _self.canvas.renderAll(), _self.canvas.trigger('object:modified');
      })

      $(`${this.containerSelector} .toolpanel#select-panel .color #color-picker`).spectrum({
        type: "color",
        showInput: "true",
        allowEmpty: "false"
      });

      $(`${this.containerSelector} .toolpanel#select-panel .color #color-picker`).change(function () {
        let color = $(this).val();
        setActiveFontStyle(_self.activeSelection, 'fill', color)
        _self.canvas.renderAll(), _self.canvas.trigger('object:modified');
      })
    })();
    // end font section

    // border section
    (() => {
      $(`${this.containerSelector} .toolpanel#select-panel .content`).append(`
        <div class="border-section">
          <h4>Border</h4>
          <div class="input-container"><label>Width</label>
            <div class="custom-number-input">
            <button class="decrease">-</button>
            <input type="number" min="1" value="1" id="input-border-width">
            <button class="increase">+</button>
            </div>
          </div>
          <div class="input-container"><label>Style</label><select id="input-border-style">${BorderStyleList.map(item => `<option value='${JSON.stringify(item.value)}'>${item.label}</option>`)}</select></div>
          <div class="input-container"><label>Corner Type</label><select id="input-corner-type"><option value="miter" selected>Square</option><option value="round">Round</option></select></div>
          <div class="input-container"><label>Color</label><input id="color-picker" value="black"></div>
          <hr>
        </div>
      `);

      $(`${this.containerSelector} .toolpanel#select-panel .border-section #color-picker`).spectrum({
        showButtons: false,
        type: "color",
        showInput: "true",
        allowEmpty: "false",
        move: function (color) {
          let hex = 'transparent';
          color && (hex = color.toRgbString()); // #ff0000
          _self.canvas.getActiveObjects().forEach(obj => obj.set('stroke', hex))
          _self.canvas.renderAll(), _self.canvas.trigger('object:modified')
        }
      });

      $(`${this.containerSelector} .toolpanel#select-panel .border-section #input-border-width`).change(function () {
        let width = parseInt($(this).val());
        _self.canvas.getActiveObjects().forEach(obj => obj.set({
          strokeUniform: true,
          strokeWidth: width
        }))
        _self.canvas.renderAll(), _self.canvas.trigger('object:modified')
      })

      $(`${this.containerSelector} .toolpanel#select-panel .border-section #input-border-style`).change(function () {
        try {
          let style = JSON.parse($(this).val());
          _self.canvas.getActiveObjects().forEach(obj => obj.set({
            strokeUniform: true,
            strokeDashArray: style.strokeDashArray,
            strokeLineCap: style.strokeLineCap
          }))
          _self.canvas.renderAll(), _self.canvas.trigger('object:modified')
        } catch (_) {}
      })

      $(`${this.containerSelector} .toolpanel#select-panel .border-section #input-corner-type`).change(function () {
        let corner = $(this).val();
        _self.canvas.getActiveObjects().forEach(obj => obj.set('strokeLineJoin', corner))
        _self.canvas.renderAll(), _self.canvas.trigger('object:modified')
      })
    })();
    // end border section

    // fill color section
    (() => {
      $(`${this.containerSelector} .toolpanel#select-panel .content`).append(`
        <div class="fill-section">
          <div class="tab-container">
          <div class="tabs">
            <div class="tab-label" data-value="color-fill">Color Fill</div>
            <div class="tab-label" data-value="gradient-fill">Gradient Fill</div>
          </div>
          <div class="tab-content" data-value="color-fill">
            <input id="color-picker" value='black'/><br>
          </div>
          <div class="tab-content" data-value="gradient-fill">
            <div id="gradient-picker"></div>
            <div class="gradient-orientation-container">
              <div class="input-container">
                <label>Orientation</label>
                <select id="select-orientation">
                  <option value="linear">Linear</option>
                  <option value="radial">Radial</option>
                </select>
              </div>
              <div id="angle-input-container" class="input-container">
                <label>Angle</label>
                <div class="custom-number-input">
                  <button class="decrease">-</button>
                  <input type="number" min="0" max="360" value="0" id="input-angle">
                  <button class="increase">+</button>
                </div>
              </div>
            </div>
          </div>
        </div>
        </div>
      `);

      $(`${this.containerSelector} .toolpanel#select-panel .content .tab-label`).click(function () {
        $(`${_self.containerSelector} .toolpanel#select-panel .content .tab-label`).removeClass('active');
        $(this).addClass('active');
        let target = $(this).data('value');
        $(this).closest('.tab-container').find('.tab-content').hide();
        $(this).closest('.tab-container').find(`.tab-content[data-value=${target}]`).show();
        if (target === 'color-fill') {
          let color = $(`${_self.containerSelector} .toolpanel#select-panel .fill-section #color-picker`).val();
          try {
            _self.canvas.getActiveObjects().forEach(obj => obj.set('fill', color))
            _self.canvas.renderAll(), _self.canvas.trigger('object:modified')
          } catch (_) {
            console.log("can't update background color")
          }
        } else {
          updateGradientFill();
        }
      })

      $(`${_self.containerSelector} .toolpanel#select-panel .content .tab-label[data-value=color-fill]`).click();

      $(`${this.containerSelector} .toolpanel#select-panel .fill-section #color-picker`).spectrum({
        flat: true,
        showPalette: false,
        showButtons: false,
        type: "color",
        showInput: "true",
        allowEmpty: "false",
        move: function (color) {
          let hex = 'transparent';
          color && (hex = color.toRgbString()); // #ff0000
          _self.canvas.getActiveObjects().forEach(obj => obj.set('fill', hex))
          _self.canvas.renderAll(), _self.canvas.trigger('object:modified')
        }
      });

      const gp = new Grapick({
        el: `${this.containerSelector} .toolpanel#select-panel .fill-section #gradient-picker`,
        colorEl: '<input id="colorpicker"/>'
      });

      gp.setColorPicker(handler => {
        const el = handler.getEl().querySelector('#colorpicker');
        $(el).spectrum({
          showPalette: false,
          showButtons: false,
          type: "color",
          color: handler.getColor(),
          showAlpha: true,
          change(color) {
            handler.setColor(color.toRgbString());
          },
          move(color) {
            handler.setColor(color.toRgbString(), 0);
          }
        });
      });
      gp.addHandler(0, 'red');
      gp.addHandler(100, 'blue');

      const updateGradientFill = () => {
        let stops = gp.getHandlers();
        let orientation = $(`${this.containerSelector} .toolpanel#select-panel .content .gradient-orientation-container #select-orientation`).val();
        let angle = parseInt($(`${this.containerSelector} .toolpanel#select-panel .content .gradient-orientation-container #input-angle`).val());

        let gradient = generateFabricGradientFromColorStops(stops, _self.activeSelection.width, _self.activeSelection.height, orientation, angle);
        _self.activeSelection.set('fill', gradient);
        _self.canvas.renderAll()
      }

      gp.on('change', complete => {
        updateGradientFill();
      })

      $(`${this.containerSelector} .toolpanel#select-panel .content .gradient-orientation-container #select-orientation`).change(function () {
        let type = $(this).val();
        console.log('orientation', type)
        if (type === 'radial') {
          $(this).closest('.gradient-orientation-container').find('#angle-input-container').hide();
        } else {
          $(this).closest('.gradient-orientation-container').find('#angle-input-container').show();
        }
        updateGradientFill();
      })

      $(`${this.containerSelector} .toolpanel#select-panel .content .gradient-orientation-container #input-angle`).change(function () {
        updateGradientFill();
      })

    })();
    // end fill color section

    // alignment section
    (() => {
      let buttons = ``;
      AlignmentButtonList.forEach(item => {
        buttons += `<button data-pos="${item.pos}">${item.icon}</button>`
      })
      $(`${this.containerSelector} .toolpanel#select-panel .content`).append(`
        <div class="alignment-section">
          <h4>Alignment</h4>
          ${buttons}
          <hr>
        </div>
      `);

      $(`${this.containerSelector} .toolpanel#select-panel .alignment-section button`).click(function () {
        let pos = $(this).data('pos');
        alignObject(_self.canvas, _self.activeSelection, pos);
      })
    })();
    // end alignment section

    // object options section
    (() => {
      $(`${this.containerSelector} .toolpanel#select-panel .content`).append(`
        <div class="object-options">
          <h4>Object Options</h4>
          <button id="flip-h"><svg width="512" height="512" enable-background="new 0 0 16 16" viewBox="0 0 16 20" xml:space="preserve"><g transform="matrix(0 1.5365 1.5385 0 -5.0769 1.5495)"><rect x="5" y="8" width="1" height="1"></rect><rect x="7" y="8" width="1" height="1"></rect><rect x="9" y="8" width="1" height="1"></rect><rect x="1" y="8" width="1" height="1"></rect><rect x="3" y="8" width="1" height="1"></rect><path d="M 1,2 5.5,6 10,2 Z M 7.37,3 5.5,4.662 3.63,3 Z"></path><polygon points="10 15 5.5 11 1 15"></polygon></g></svg></button>
          <button id="flip-v"><svg width="512" height="512" enable-background="new 0 0 16 16" viewBox="0 0 16 20" xml:space="preserve"><g transform="matrix(1.5365 0 0 1.5385 -.45052 -3.0769)"><rect x="5" y="8" width="1" height="1"></rect><rect x="7" y="8" width="1" height="1"></rect><rect x="9" y="8" width="1" height="1"></rect><rect x="1" y="8" width="1" height="1"></rect><rect x="3" y="8" width="1" height="1"></rect><path d="M 1,2 5.5,6 10,2 Z M 7.37,3 5.5,4.662 3.63,3 Z"></path><polygon points="5.5 11 1 15 10 15"></polygon></g></svg></button>
          <button id="bring-fwd"><svg x="0px" y="0px" viewBox="0 0 1000 1000" enable-background="new 0 0 1000 1000" xml:space="preserve"><g><path d="M10,10h686v686H10V10 M990,304v686H304V794h98v98h490V402h-98v-98H990z"></path></g></svg></button>
          <button id="bring-back"><svg enable-background="new 0 0 1000 1000" viewBox="0 0 1e3 1e3" xml:space="preserve"><path d="m990 990h-686v-686h686v686m-980-294v-686h686v680h-98v-582h-490v490h200v98z"></path><rect x="108.44" y="108" width="490" height="490" fill="#fff"></rect></svg></button>
          <button id="duplicate"><svg id="Capa_1" x="0px" y="0px" viewBox="0 0 512 512" xml:space="preserve"><g><g><g><path d="M42.667,256c0-59.52,35.093-110.827,85.547-134.827V75.2C53.653,101.44,0,172.48,0,256s53.653,154.56,128.213,180.8 v-45.973C77.76,366.827,42.667,315.52,42.667,256z"></path><path d="M320,64c-105.92,0-192,86.08-192,192s86.08,192,192,192s192-86.08,192-192S425.92,64,320,64z M320,405.333 c-82.347,0-149.333-66.987-149.333-149.333S237.653,106.667,320,106.667S469.333,173.653,469.333,256 S402.347,405.333,320,405.333z"></path><polygon points="341.333,170.667 298.667,170.667 298.667,234.667 234.667,234.667 234.667,277.333 298.667,277.333 298.667,341.333 341.333,341.333 341.333,277.333 405.333,277.333 405.333,234.667 341.333,234.667  "></polygon></g></g></g></svg></button>
          <button id="delete"><svg id="Layer_1" x="0px" y="0px" viewBox="0 0 512 512" xml:space="preserve"><g><g><path d="M425.298,51.358h-91.455V16.696c0-9.22-7.475-16.696-16.696-16.696H194.855c-9.22,0-16.696,7.475-16.696,16.696v34.662 H86.704c-9.22,0-16.696,7.475-16.696,16.696v51.357c0,9.22,7.475,16.696,16.696,16.696h5.072l15.26,359.906 c0.378,8.937,7.735,15.988,16.68,15.988h264.568c8.946,0,16.302-7.051,16.68-15.989l15.259-359.906h5.073 c9.22,0,16.696-7.475,16.696-16.696V68.054C441.994,58.832,434.519,51.358,425.298,51.358z M211.551,33.391h88.9v17.967h-88.9 V33.391z M372.283,478.609H139.719l-14.522-342.502h261.606L372.283,478.609z M408.602,102.715c-15.17,0-296.114,0-305.202,0 V84.749h305.202V102.715z"></path></g></g><g><g><path d="M188.835,187.304c-9.22,0-16.696,7.475-16.696,16.696v206.714c0,9.22,7.475,16.696,16.696,16.696 c9.22,0,16.696-7.475,16.696-16.696V204C205.53,194.779,198.055,187.304,188.835,187.304z"></path></g></g><g><g><path d="M255.998,187.304c-9.22,0-16.696,7.475-16.696,16.696v206.714c0,9.22,7.474,16.696,16.696,16.696 c9.22,0,16.696-7.475,16.696-16.696V204C272.693,194.779,265.218,187.304,255.998,187.304z"></path></g></g><g><g><path d="M323.161,187.304c-9.22,0-16.696,7.475-16.696,16.696v206.714c0,9.22,7.475,16.696,16.696,16.696 s16.696-7.475,16.696-16.696V204C339.857,194.779,332.382,187.304,323.161,187.304z"></path></g></g></svg></button>
          <button id="group"><svg width="248" height="249" viewBox="0 0 248 249"><g><rect fill="none" id="canvas_background" height="251" width="250" y="-1" x="-1"></rect><g display="none" overflow="visible" y="0" x="0" height="100%" width="100%" id="canvasGrid"><rect fill="url(#gridpattern)" stroke-width="0" y="0" x="0" height="100%" width="100%"></rect></g></g><g><rect id="svg_1" height="213.999997" width="213.999997" y="18.040149" x="16.8611" stroke-width="14" stroke="#000" fill="none"></rect><ellipse ry="39.5" rx="39.5" id="svg_2" cy="87.605177" cx="90.239139" stroke-opacity="null" stroke-width="5" stroke="#000" fill="#000000"></ellipse><rect id="svg_3" height="61.636373" width="61.636373" y="135.606293" x="133.750604" stroke-opacity="null" stroke-width="5" stroke="#000" fill="#000000"></rect><rect id="svg_4" height="26.016205" width="26.016205" y="4.813006" x="3.999997" stroke-opacity="null" stroke-width="8" stroke="#000" fill="#000000"></rect><rect id="svg_5" height="26.016205" width="26.016205" y="3.999999" x="217.820703" stroke-opacity="null" stroke-width="8" stroke="#000" fill="#000000"></rect><rect id="svg_7" height="26.016205" width="26.016205" y="218.633712" x="3.999997" stroke-opacity="null" stroke-width="8" stroke="#000" fill="#000000"></rect><rect id="svg_8" height="26.016205" width="26.016205" y="218.633712" x="217.820694" stroke-opacity="null" stroke-width="8" stroke="#000" fill="#000000"></rect></g></svg></button>
          <button id="ungroup"><svg width="247.99999999999997" height="248.99999999999997" viewBox="0 0 248 249"><g><rect fill="none" id="canvas_background" height="251" width="250" y="-1" x="-1"></rect><g display="none" overflow="visible" y="0" x="0" height="100%" width="100%" id="canvasGrid"><rect fill="url(#gridpattern)" stroke-width="0" y="0" x="0" height="100%" width="100%"></rect></g></g><g><rect stroke-dasharray="20" id="svg_1" height="213.999997" width="213.999997" y="18.040149" x="16.8611" stroke-width="16" stroke="#000" fill="none"></rect><ellipse ry="39.5" rx="39.5" id="svg_2" cy="87.605177" cx="90.239139" stroke-opacity="null" stroke-width="5" stroke="#000" fill="#000000"></ellipse><rect id="svg_3" height="61.636373" width="61.636373" y="135.606293" x="133.750604" stroke-opacity="null" stroke-width="5" stroke="#000" fill="#000000"></rect></g></svg></button>
          <hr>
        </div>
      `);

      $(`${this.containerSelector} .toolpanel#select-panel .object-options #flip-h`).click(() => {
        this.activeSelection.set('flipX', !this.activeSelection.flipX);
        this.canvas.renderAll(), this.canvas.trigger('object:modified');
      })
      $(`${this.containerSelector} .toolpanel#select-panel .object-options #flip-v`).click(() => {
        this.activeSelection.set('flipY', !this.activeSelection.flipY);
        this.canvas.renderAll(), this.canvas.trigger('object:modified');
      })
      $(`${this.containerSelector} .toolpanel#select-panel .object-options #bring-fwd`).click(() => {
        this.canvas.bringForward(this.activeSelection)
        this.canvas.renderAll(), this.canvas.trigger('object:modified');
      })
      $(`${this.containerSelector} .toolpanel#select-panel .object-options #bring-back`).click(() => {
        this.canvas.sendBackwards(this.activeSelection)
        this.canvas.renderAll(), this.canvas.trigger('object:modified');
      })
      $(`${this.containerSelector} .toolpanel#select-panel .object-options #duplicate`).click(() => {
        let clonedObjects = []
        let activeObjects = this.canvas.getActiveObjects()
        activeObjects.forEach(obj => {
          obj.clone(clone => {
            this.canvas.add(clone.set({
              strokeUniform: true,
              left: obj.aCoords.tl.x + 20,
              top: obj.aCoords.tl.y + 20
            }));

            if (activeObjects.length === 1) {
              this.canvas.setActiveObject(clone)
            }
            clonedObjects.push(clone)
          })
        })

        if (clonedObjects.length > 1) {
          let sel = new fabric.ActiveSelection(clonedObjects, {
            canvas: this.canvas,
          });
          this.canvas.setActiveObject(sel)
        }

        this.canvas.requestRenderAll(), this.canvas.trigger('object:modified')
      })
      $(`${this.containerSelector} .toolpanel#select-panel .object-options #delete`).click(() => {
        this.canvas.getActiveObjects().forEach(obj => this.canvas.remove(obj))
        this.canvas.discardActiveObject().requestRenderAll(), this.canvas.trigger('object:modified');
      })
      $(`${this.containerSelector} .toolpanel#select-panel .object-options #group`).click(() => {
        if (this.activeSelection.type !== 'activeSelection') return;
        this.canvas.getActiveObject().toGroup()
        this.canvas.requestRenderAll(), this.canvas.trigger('object:modified')
      })
      $(`${this.containerSelector} .toolpanel#select-panel .object-options #ungroup`).click(() => {
        if (this.activeSelection.type !== 'group') return;
        this.canvas.getActiveObject().toActiveSelection()
        this.canvas.requestRenderAll(), this.canvas.trigger('object:modified');
      })
    })();
    // end object options section

    // effect section
    (() => {
      $(`${this.containerSelector} .toolpanel#select-panel .content`).append(`
        <div class="effect-section">
          <h4>Effect</h4>
          <div class="input-container"><label>Opacity</label><input id="opacity" type="range" min="0" max="1" value="1" step="0.01"></div>
          <div class="input-container"><label>Blur</label><input class="effect" id="blur" type="range" min="0" max="100" value="50"></div>
          <div class="input-container"><label>Brightness</label><input class="effect" id="brightness" type="range" min="0" max="100" value="50"></div>
          <div class="input-container"><label>Saturation</label><input class="effect" id="saturation" type="range" min="0" max="100" value="50"></div>
          <h5>Gamma</h5>
          <div class="input-container"><label>Red</label><input class="effect" id="gamma.r" type="range" min="0" max="100" value="50"></div>
          <div class="input-container"><label>Green</label><input class="effect" id="gamma.g" type="range" min="0" max="100" value="50"></div>
          <div class="input-container"><label>Blue</label><input class="effect" id="gamma.b" type="range" min="0" max="100" value="50"></div>
          <hr>
        </div>
      `);

      $(`${this.containerSelector} .toolpanel#select-panel .effect-section #opacity`).change(function () {
        let opacity = parseFloat($(this).val());
        _self.activeSelection.set('opacity', opacity)
        _self.canvas.renderAll(), _self.canvas.trigger('object:modified')
      })

      $(`${this.containerSelector} .toolpanel#select-panel .effect-section .effect`).change(function () {
        let effect = $(this).attr('id');
        let value = parseFloat($(this).val());
        let currentEffect = getCurrentEffect(_self.activeSelection);
        _self.activeSelection.filters = getUpdatedFilter(currentEffect, effect, value);
        _self.activeSelection.applyFilters();
        _self.canvas.renderAll(), _self.canvas.trigger('object:modified')
      })
    })();
    // end effect section
  }

  window.ImageEditor.prototype.initializeSelectionSettings = selectionSettings;
})();

/**
 * Define action to add shape to canvas
 */
(function () {
  'use strict';
  const defaultShapes = [
    `<svg viewBox="-10 -10 120 120"><polygon points="0 0, 0 100, 100 100, 100 0" stroke-width="8" stroke="#000" fill="none"></polygon></svg>`,
    `<svg viewBox="-8 -8 120 120"><polygon fill="none" stroke-width="8" stroke="black" points="50 0, 85 50, 50 100, 15 50"></polygon></svg>`,
    `<svg viewBox="-10 -10 120 120"><polygon points="25 0, 0 100, 75 100, 100 0" stroke-width="8" stroke="#000" fill="none"></polygon></svg>`,
    `<svg viewBox="-8 -8 120 120"><polygon points="0,100 30,10 70,10 100,100" stroke-width="8" stroke="#000" fill="none"></polygon></svg>`,
    `<svg viewBox="-10 -10 120 120"><path d="M 80,80 V 20 H 20 v 60 z m 20,20 V 0 H 0 v 100 z" stroke-width="8" stroke="#000" fill-rule="evenodd" fill="none"></path></svg>`,
    `<svg viewBox="0 0 100 100"><polygon points="26,86 11.2,40.4 50,12.2 88.8,40.4 74,86 " stroke="#000" stroke-width="8" fill="none"></polygon></svg>`,
    `<svg viewBox="0 0 100 100"><polygon points="30.1,84.5 10.2,50 30.1,15.5 69.9,15.5 89.8,50 69.9,84.5" stroke-width="8" stroke="#000" fill="none"></polygon></svg>`,
    `<svg viewBox="0 0 100 100"><polygon points="34.2,87.4 12.3,65.5 12.3,34.5 34.2,12.6 65.2,12.6 87.1,34.5 87.1,65.5 65.2,87.4" stroke-width="8" stroke="#000" fill="none"></polygon></svg>`,
    `<svg viewBox="0 0 100 100"><polygon points="11.2,70 11.2,40 50,12.2 88.8,40 88.8,70" stroke="#000" stroke-width="8" fill="none"></polygon></svg>`,
    `<svg viewBox="0 0 100 100"><polygon points="10.2,70 10.2,35 30.1,15 69.9,15 89.8,35 89.8,70" stroke-width="8" stroke="#000" fill="none"></polygon></svg>`,
    `<svg viewBox="-10 -10 120 120"><polygon points="50 15, 100 100, 0 100" stroke-width="8" stroke="#000" fill="none"></polygon></svg>`,
    `<svg viewBox="-10 -10 120 120"><polygon points="0 0, 100 100, 0 100" stroke-width="8" stroke="#000" fill="none"></polygon></svg>`,
    `<svg viewBox="-10 -10 120 120"><path d="M 26,85 50,45 74,85 Z m -26,15 50,-85 50,85 z" stroke-width="8" stroke="#000" fill="none"></path></svg>`,
    `<svg viewBox="8 50 100 100"><path d="M 62.68234,131.5107 H 26.75771 V 96.075507 Z M 11.572401,146.76255 V 59.66782 l 87.983665,87.09473 z" stroke-width="8" stroke="#000" fill="none" fill-rule="evenodd"></path></svg>`,
    `<svg viewBox="-2 -2 100 100"><circle cx="50" cy="50" r="40" stroke="#000" stroke-width="8" fill="none"></circle></svg>`,
    `<svg x="0px" y="0px" viewBox="0 0 96 120" xml:space="preserve"><path stroke="#000" stroke-width="8" fill="none" d="M9.113,65.022C11.683,45.575,28.302,30.978,48,30.978c19.696,0,36.316,14.598,38.887,34.045H9.113z"></path></svg>`,
    `<svg viewBox="-15 -15 152 136"><path stroke="#000000" stroke-width="8" d="m0 0l57.952755 0l0 0c32.006428 -1.4055393E-14 57.952755 23.203636 57.952755 51.82677c0 28.623135 -25.946327 51.82677 -57.952755 51.82677l-57.952755 0z" fill="none"></path></svg>`,
    `<svg viewBox="-5 -50 140 140"><path stroke="#000000" stroke-width="8" d="m20.013628 0l84.37401 0l0 0c11.053215 -1.04756605E-14 20.013626 9.282301 20.013626 20.7326c0 11.450296 -8.960411 20.7326 -20.013626 20.7326l-84.37401 0l0 0c-11.053222 0 -20.013628 -9.282303 -20.013628 -20.7326c-5.2380687E-15 -11.450298 8.960406 -20.7326 20.013628 -20.7326z" fill="none"></path></svg>`,
    `<svg viewBox="-8 -8 136 136"><path stroke="#000000" stroke-width="8" d="m0 51.82677l0 0c0 -28.623135 23.203636 -51.82677 51.82677 -51.82677l0 0c13.745312 0 26.927654 5.4603047 36.64706 15.17971c9.719406 9.719404 15.17971 22.901749 15.17971 36.64706l0 0c0 28.623135 -23.203636 51.82677 -51.82677 51.82677l0 0c-28.623135 0 -51.82677 -23.203636 -51.82677 -51.82677zm25.913385 0l0 0c0 14.311565 11.60182 25.913387 25.913385 25.913387c14.311565 0 25.913387 -11.601822 25.913387 -25.913387c0 -14.311565 -11.601822 -25.913385 -25.913387 -25.913385l0 0c-14.311565 0 -25.913385 11.60182 -25.913385 25.913385z" fill="none"></path></svg>`,
    `<svg viewBox="-7 -35 133 105"><path stroke="#000000" stroke-width="8" d="m0 57.952755l0 0c0 -32.006424 25.946333 -57.952755 57.952755 -57.952755c32.006428 0 57.952755 25.946333 57.952755 57.952755l-28.97638 0c0 -16.003212 -12.97316 -28.976377 -28.976376 -28.976377c-16.003212 0 -28.976377 12.9731655 -28.976377 28.976377z" fill="none"></path></svg>`,
    `<svg viewBox="-10 -10 150 150" fill="none" stroke="none" stroke-linecap="square" stroke-miterlimit="10"><path stroke="#000000" stroke-width="8" stroke-linejoin="round" stroke-linecap="butt" d="m0 51.82677l42.665005 -9.161766l9.161766 -42.665005l9.161766 42.665005l42.665005 9.161766l-42.665005 9.161766l-9.161766 42.665005l-9.161766 -42.665005z" fill-rule="evenodd" fill="none"></path></svg>`,
    `<svg viewBox="-15 -15 137 130"><path stroke="#000000" stroke-width="8" d="m1.09633125E-4 37.631077l39.59224 2.632141E-4l12.234421 -37.63134l12.234425 37.63134l39.59224 -2.632141E-4l-32.030952 23.257183l12.234924 37.631172l-32.030636 -23.257607l-32.03064 23.257607l12.234926 -37.631172z" fill="none"></path></svg>`,
    `<svg viewBox="-10 -10 150 150" fill="none" stroke="none" stroke-linecap="square" stroke-miterlimit="10"><path stroke="#000000" stroke-width="8" stroke-linejoin="round" stroke-linecap="butt" d="m0 59.82677l27.527777 -8.654488l-19.512508 -21.258898l28.167 6.268881l-6.268881 -28.167l21.258898 19.512508l8.654488 -27.527777l8.654491 27.527777l21.258896 -19.512508l-6.2688828 28.167l28.167 -6.268881l-19.512512 21.258898l27.527779 8.654488l-27.527779 8.654491l19.512512 21.258896l-28.167 -6.2688828l6.2688828 28.167l-21.258896 -19.512512l-8.654491 27.527779l-8.654488 -27.527779l-21.258898 19.512512l6.268881 -28.167l-28.167 6.2688828l19.512508 -21.258896z" fill-rule="evenodd"></path></svg>`,
    `<svg viewBox="-10 -10 150 150" fill="none" stroke="none" stroke-linecap="square" stroke-miterlimit="10"><path stroke="#000000" stroke-width="8" stroke-linejoin="round" stroke-linecap="butt" d="m0 59.82677l33.496998 -3.4664993l-31.45845 -12.017807l33.252647 5.321434l-27.275928 -19.750513l30.742428 13.746485l-21.234838 -26.137014l26.137014 21.234838l-13.746485 -30.742428l19.750513 27.275928l-5.321434 -33.252647l12.017807 31.45845l3.4664993 -33.496998l3.4664993 33.496998l12.017811 -31.45845l-5.321434 33.252647l19.750511 -27.275928l-13.746483 30.742428l26.137009 -21.234838l-21.234833 26.137014l30.742424 -13.746485l-27.275925 19.750513l33.252647 -5.321434l-31.45845 12.017807l33.496994 3.4664993l-33.496994 3.4664993l31.45845 12.017811l-33.252647 -5.321434l27.275925 19.750511l-30.742424 -13.746483l21.234833 26.137009l-26.137009 -21.234833l13.746483 30.742424l-19.750511 -27.275925l5.321434 33.252647l-12.017811 -31.45845l-3.4664993 33.496994l-3.4664993 -33.496994l-12.017807 31.45845l5.321434 -33.252647l-19.750513 27.275925l13.746485 -30.742424l-26.137014 21.234833l21.234838 -26.137009l-30.742428 13.746483l27.275928 -19.750511l-33.252647 5.321434l31.45845 -12.017811z" fill-rule="evenodd"></path></svg>`,
    `<svg viewBox="-10 -10 150 150" fill="none" stroke="none" stroke-linecap="square" stroke-miterlimit="10"><path stroke="#000000" stroke-width="8" stroke-linejoin="round" stroke-linecap="butt" d="m0 59.82677l9.952638 -6.5662766l-7.91409 -8.91803l11.312678 -3.7663116l-5.3359585 -10.662767l11.902236 -0.7101288l-2.3946476 -11.680401l11.680401 2.3946476l0.7101288 -11.902236l10.662767 5.3359585l3.7663116 -11.312678l8.91803 7.91409l6.5662766 -9.952638l6.5662804 9.952638l8.91803 -7.91409l3.7663116 11.312678l10.6627655 -5.3359585l0.7101288 11.902236l11.680397 -2.3946476l-2.3946457 11.680401l11.902237 0.7101288l-5.3359604 10.662767l11.312683 3.7663116l-7.914093 8.91803l9.952637 6.5662766l-9.952637 6.5662804l7.914093 8.91803l-11.312683 3.7663116l5.3359604 10.6627655l-11.902237 0.7101288l2.3946457 11.680397l-11.680397 -2.3946457l-0.7101288 11.902237l-10.6627655 -5.3359604l-3.7663116 11.312683l-8.91803 -7.914093l-6.5662804 9.952637l-6.5662766 -9.952637l-8.91803 7.914093l-3.7663116 -11.312683l-10.662767 5.3359604l-0.7101288 -11.902237l-11.680401 2.3946457l2.3946476 -11.680397l-11.902236 -0.7101288l5.3359585 -10.6627655l-11.312678 -3.7663116l7.91409 -8.91803z" fill-rule="evenodd"></path></svg>`,
    `<svg viewBox="-10 -40 140 140" fill="none" stroke="none" stroke-linecap="square" stroke-miterlimit="10"><path stroke="#000000" stroke-width="8" stroke-linejoin="round" stroke-linecap="butt" d="m0 14.960629l89.732285 0l0 -14.960629l29.921257 29.921259l-29.921257 29.921259l0 -14.9606285l-89.732285 0z" fill-rule="evenodd"></path></svg>`,
    `<svg viewBox="-10 -60 180 180" fill="none" stroke="none" stroke-linecap="square" stroke-miterlimit="10"><path stroke="#000000" stroke-width="8" stroke-linecap="butt" d="m0 32.238846l27.590551 -27.590551l0 13.795275l82.80315 0l0 -13.795275l27.590553 27.590551l-27.590553 27.59055l0 -13.795273l-82.80315 0l0 13.795273z" fill-rule="evenodd"></path></svg>`,
    `<svg viewBox="-10 -10 150 150" fill="none" stroke="none" stroke-linecap="square" stroke-miterlimit="10"><path stroke="#000000" stroke-width="8" stroke-linecap="butt" d="m0.005249344 89.74016l29.913385 -29.913387l0 14.956692l44.87008 0l0 -44.87008l-14.956692 0l29.913387 -29.913385l29.913383 29.913385l-14.956688 0l0 74.78347l-74.78347 0l0 14.956688z" fill-rule="evenodd"></path></svg>`,
    `<svg viewBox="-10 -20 200 200" fill="none" stroke="none" stroke-linecap="square" stroke-miterlimit="10"><path stroke="#000000" stroke-width="8" stroke-linecap="butt" d="m0.005249344 89.74016l29.913385 -29.913387l0 14.956692l40.35827 0l0 -44.87008l-14.956692 0l29.913387 -29.913385l29.913383 29.913385l-14.956688 0l0 44.87008l40.35826 0l0 -14.956692l29.913391 29.913387l-29.913391 29.913383l0 -14.956688l-110.62992 0l0 14.956688z" fill-rule="evenodd"></path></svg>`,
    `<svg viewBox="-10 -10 150 150" fill="none" stroke="none" stroke-linecap="square" stroke-miterlimit="10"><path stroke="#000000" stroke-width="8" stroke-linecap="butt" d="m0.005249344 59.82677l26.922047 -19.30849l0 9.424511l23.020744 0l0 -23.020744l-9.424511 0l19.30849 -26.922047l19.30849 26.922047l-9.424507 0l0 23.020744l23.020744 0l0 -9.424511l26.922043 19.30849l-26.922043 19.30849l0 -9.424507l-23.020744 0l0 23.020744l9.424507 0l-19.30849 26.922043l-19.30849 -26.922043l9.424511 0l0 -23.020744l-23.020744 0l0 9.424507z" fill-rule="evenodd"></path></svg>`,
    `<svg viewBox="-10 -10 158 136" fill="none" stroke="none" stroke-linecap="square" stroke-miterlimit="10"><path stroke="#000000" stroke-width="8" stroke-linecap="butt" d="m0 77.22078l81.043304 0l0 -51.480316l-12.870079 0l25.740158 -25.740158l25.740158 25.740158l-12.870079 0l0 77.220474l-106.78346 0z" fill-rule="evenodd"></path></svg>`,
    `<svg viewBox="-10 -10 136 136" fill="none" stroke="none" stroke-linecap="square" stroke-miterlimit="10"><path stroke="#000000" stroke-width="8" stroke-linecap="butt" d="m0 102.96063l0 -57.915356l0 0c0 -24.87782 20.167458 -45.045277 45.045277 -45.045277l0 0l0 0c11.946751 0 23.404194 4.7458277 31.851818 13.193456c8.447632 8.447627 13.193459 19.905071 13.193459 31.851822l0 6.4350395l12.870079 0l-25.740158 25.740158l-25.740158 -25.740158l12.870079 0l0 -6.4350395c0 -10.661922 -8.643196 -19.305119 -19.305119 -19.305119l0 0l0 0c-10.661922 0 -19.305119 8.643196 -19.305119 19.305119l0 57.915356z" fill-rule="evenodd"></path></svg>`,
    `<svg viewBox="-10 -10 180 180" fill="none" stroke="none" stroke-linecap="square" stroke-miterlimit="10"><path stroke="#000000" stroke-width="8" stroke-linecap="butt" d="m0 0l25.742783 0l0 0l38.614174 0l90.09974 0l0 52.74803l0 0l0 22.6063l0 15.070862l-90.09974 0l-61.5304 52.813744l22.916225 -52.813744l-25.742783 0l0 -15.070862l0 -22.6063l0 0z" fill-rule="evenodd"></path></svg>`,
    `<svg viewBox="-10 -10 180 180" fill="none" stroke="none" stroke-linecap="square" stroke-miterlimit="10"><path stroke="#000000" stroke-width="8" stroke-linejoin="round" stroke-linecap="butt" d="m1.0425826 140.35696l25.78009 -49.87359l0 0c-30.142242 -17.309525 -35.62507 -47.05113 -12.666686 -68.71045c22.958385 -21.65932 66.84442 -28.147947 101.387596 -14.990329c34.543175 13.1576185 48.438576 41.655407 32.10183 65.83693c-16.336761 24.181526 -57.559166 36.132935 -95.233955 27.61071z" fill-rule="evenodd"></path></svg>`,
    `<svg viewBox="0 -5 100 100" x="0px" y="0px"><path fill="none" stroke="#000" stroke-width="8" d="M55.2785222,56.3408313 C51.3476874,61.3645942 45.2375557,64.5921788 38.3756345,64.5921788 C31.4568191,64.5921788 25.3023114,61.3108505 21.3754218,56.215501 C10.6371566,55.0276798 2.28426396,45.8997866 2.28426396,34.8156425 C2.28426396,27.0769445 6.35589452,20.2918241 12.4682429,16.4967409 C14.7287467,7.0339786 23.2203008,0 33.3502538,0 C38.667844,0 43.5339584,1.93827732 47.284264,5.14868458 C51.0345695,1.93827732 55.9006839,0 61.2182741,0 C73.0769771,0 82.6903553,9.6396345 82.6903553,21.5307263 C82.6903553,22.0787821 82.6699341,22.6220553 82.629813,23.1598225 C87.1459866,27.1069477 90,32.9175923 90,39.396648 C90,51.2877398 80.3866218,60.9273743 68.5279188,60.9273743 C63.5283115,60.9273743 58.9277995,59.2139774 55.2785222,56.3408313 L55.2785222,56.3408313 Z M4.79695431,82 C7.44623903,82 9.59390863,80.6668591 9.59390863,79.0223464 C9.59390863,77.3778337 7.44623903,76.0446927 4.79695431,76.0446927 C2.1476696,76.0446927 0,77.3778337 0,79.0223464 C0,80.6668591 2.1476696,82 4.79695431,82 Z M13.7055838,71.9217877 C18.4995275,71.9217877 22.3857868,69.4606044 22.3857868,66.424581 C22.3857868,63.3885576 18.4995275,60.9273743 13.7055838,60.9273743 C8.91163999,60.9273743 5.02538071,63.3885576 5.02538071,66.424581 C5.02538071,69.4606044 8.91163999,71.9217877 13.7055838,71.9217877 Z"></path></svg>`
  ]

  var shapes = function () {
    const _self = this;

    let ShapeList = defaultShapes;
    if (Array.isArray(this.shapes) && this.shapes.length) ShapeList = this.shapes;
    $(`${this.containerSelector} .main-panel`).append(`<div class="toolpanel" id="shapes-panel"><div class="content"><p class="title">Shapes</p></div></div>`);

    ShapeList.forEach(svg => {
      $(`${this.containerSelector} .toolpanel#shapes-panel .content`).append(`<div class="button">${svg}</div>`)
    })

    $(`${this.containerSelector} .toolpanel#shapes-panel .content .button`).click(function () {
      let svg = $(this).html();

      try {
        fabric.loadSVGFromString(
          svg,
          (objects, options) => {
            var obj = fabric.util.groupSVGElements(objects, options)
            obj.strokeUniform = true
            obj.strokeLineJoin = 'miter'
            obj.scaleToWidth(100)
            obj.scaleToHeight(100)
            obj.set({
              left: 0,
              top: 0
            })
            _self.canvas.add(obj).renderAll()
            _self.canvas.trigger('object:modified')
          }
        )
      } catch (_) {
        console.error("can't add shape");
      }
    })
  }

  window.ImageEditor.prototype.initializeShapes = shapes;
})();

/**
 * Define actions to manage tip section
 */
(function () {
  'use strict';

  function tipPanel() {
    const defaultTips = [
      'Tip: use arrows to move a selected object by 1 pixel!',
      'Tip: Shift + Click to select and modify multiple objects!',
      'Tip: hold Shift when rotating an object for 15° angle jumps!',
      'Tip: hold Shift when drawing a line for 15° angle jumps!',
      'Tip: Ctrl +/-, Ctrl + wheel to zoom in and zoom out!',
    ]
    const _self = this;
    $(`${this.containerSelector} .canvas-holder .content`).append(`
    <div id="tip-container">${defaultTips[parseInt(Math.random() * defaultTips.length)]}</div>`)
    this.hideTip = function () {
      $(`${_self.containerSelector} .canvas-holder .content #tip-container`).hide();
    }

    this.showTip = function () {
      $(`${_self.containerSelector} .canvas-holder .content #tip-container`).show();
    }

    this.updateTip = function (str) {
      typeof str === 'string' && $(`${_self.containerSelector} .canvas-holder .content #tip-container`).html(str);
    }
  }

  window.ImageEditor.prototype.initializeTipSection = tipPanel;
})();

/**
 * Initialize toolbar
 */
(function () {
  'use strict';
  var defaultButtons = [{
    name: 'select',
    title: 'Select/move object (V)',
    icon: `<svg id="Capa_1" x="0px" y="0px" viewBox="0 0 512 512" xml:space="preserve"><g><g><path d="M423.547,323.115l-320-320c-3.051-3.051-7.637-3.947-11.627-2.304s-6.592,5.547-6.592,9.856V480 c0,4.501,2.837,8.533,7.083,10.048c4.224,1.536,8.981,0.192,11.84-3.285l85.205-104.128l56.853,123.179 c1.792,3.883,5.653,6.187,9.685,6.187c1.408,0,2.837-0.277,4.203-0.875l74.667-32c2.645-1.131,4.736-3.285,5.76-5.973 c1.024-2.688,0.939-5.675-0.277-8.299l-57.024-123.52h132.672c4.309,0,8.213-2.603,9.856-6.592 C427.515,330.752,426.598,326.187,423.547,323.115z"></path></g></g></svg>`
  }, {
    name: 'shapes',
    title: 'Shapes',
    icon: `<svg id="Capa_1" x="0px" y="0px" viewBox="0 0 490.927 490.927" xml:space="preserve"><path d="M336.738,178.502c-12.645,0-24.852,1.693-36.627,4.582L202.57,11.786c-5.869-10.321-22.84-10.321-28.709,0L2.163,313.311 c-2.906,5.105-2.889,11.385,0.078,16.466c2.953,5.088,8.389,8.216,14.275,8.216l166.314,0.009 c2.818,82.551,70.688,148.88,153.906,148.88c85.012,0,154.19-69.167,154.19-154.186S421.749,178.502,336.738,178.502z  M44.917,304.964l143.299-251.63L331.515,304.97L44.917,304.964z"></path></svg>`
  }, {
    name: 'draw',
    title: 'Free draw',
    icon: `<svg height="512pt" viewBox="0 -3 512 512" width="512pt"><g id="surface1"><path d="M 497.171875 86.429688 C 506.734375 76.867188 512 64.152344 512 50.628906 C 512 37.105469 506.734375 24.390625 497.171875 14.828125 C 487.609375 5.265625 474.894531 0 461.371094 0 C 447.847656 0 435.132812 5.265625 425.570312 14.828125 L 198.296875 242.105469 L 269.894531 313.703125 Z M 497.171875 86.429688 " style="stroke: none; fill-rule: nonzero; fill: rgb(0, 0, 0); fill-opacity: 1;"></path><path d="M 65.839844 506.65625 C 92.171875 507.21875 130.371094 496.695312 162.925781 459.074219 C 164.984375 456.691406 166.894531 454.285156 168.664062 451.855469 C 179.460938 435.875 184.695312 418.210938 183.855469 400.152344 C 182.945312 380.5625 174.992188 362.324219 161.460938 348.796875 C 150.28125 337.613281 134.722656 331.457031 117.648438 331.457031 C 95.800781 331.457031 73.429688 341.296875 56.277344 358.449219 C 31.574219 383.152344 31.789062 404.234375 31.976562 422.839844 C 32.15625 440.921875 32.316406 456.539062 11.101562 480.644531 L 0 493.257812 C 0 493.257812 26.828125 505.820312 65.839844 506.65625 Z M 65.839844 506.65625 " style="stroke: none; fill-rule: nonzero; fill: rgb(0, 0, 0); fill-opacity: 1;"></path><path d="M 209.980469 373.621094 L 248.496094 335.101562 L 176.894531 263.503906 L 137.238281 303.160156 C 154.691406 306.710938 170.464844 315 182.859375 327.394531 C 195.746094 340.285156 205.003906 356.1875 209.980469 373.621094 Z M 209.980469 373.621094 " style="stroke: none; fill-rule: nonzero; fill: rgb(0, 0, 0); fill-opacity: 1;"></path></g></svg>`
  }, {
    name: 'line',
    title: 'Line',
    icon: `<svg id="Capa_1" x="0px" y="0px" viewBox="0 0 512 512" xml:space="preserve"><path d="M349.091,0v124.516L124.516,349.091H0V512h162.909V387.484l224.574-224.574H512V0H349.091z M54.303,457.696v-54.303 h54.303v54.303H54.303z M457.696,108.605h-54.303V54.303h54.303V108.605z"></path></svg>`
  }, {
    name: 'path',
    title: 'Connectable lines & curves',
    icon: '<svg id="svg8" viewBox="28 55 140 140"><path d="m 28.386086,150.01543 v 43.10301 H 71.489092 V 178.7505 H 120.75466 V 164.38283 H 71.355237 L 71.488872,150.0086 H 57.121421 c 0,-49.247 14.367449,-63.614929 63.633239,-63.614929 v -14.36768 c -63.633239,0 -78.000906,28.735609 -78.000906,77.982609 l -14.367888,0.007 z m 14.367669,28.73507 v -14.36767 h 14.367668 v 14.36767 z" id="path840" style="stroke-width: 0.264583;"></path><path d="m 120.74975,150.00843 v 43.10301 h 43.10301 V 150.0016 l -43.10301,0.007 z m 14.36767,28.73507 v -14.36767 h 14.36767 v 14.36767 z" id="path840-1" style="stroke-width: 0.264583;"></path><path d="m 120.74975,57.658601 v 43.103009 h 43.10301 V 57.651771 l -43.10301,0.007 z m 14.36767,28.73507 v -14.36767 h 14.36767 v 14.36767 z" id="path840-1-0" style="stroke-width: 0.264583;"></path></svg>'
  }, {
    name: 'textbox',
    title: 'Text box',
    icon: `<svg id="Capa_1" x="0px" y="0px" viewBox="0 0 512 512" xml:space="preserve"><g><g><path d="M497,90c8.291,0,15-6.709,15-15V15c0-8.291-6.709-15-15-15h-60c-8.291,0-15,6.709-15,15v15H90V15c0-8.401-6.599-15-15-15 H15C6.599,0,0,6.599,0,15v60c0,8.399,6.599,15,15,15h15v332H15c-8.291,0-15,6.709-15,15v60c0,8.291,6.709,15,15,15h60 c8.291,0,15-6.709,15-15v-15h332v15c0,8.399,6.599,15,15,15h60c8.401,0,15-6.601,15-15v-60c0-8.401-6.599-15-15-15h-15V90H497z  M452,422h-15c-8.401,0-15,6.599-15,15v15H90v-15c0-8.291-6.709-15-15-15H60V90h15c8.401,0,15-6.601,15-15V60h332v15 c0,8.291,6.709,15,15,15h15V422z"></path></g></g><g><g><path d="M361,105H151c-8.291,0-15,6.709-15,15v60c0,6.064,3.647,11.543,9.258,13.857c5.625,2.329,12.056,1.04,16.348-3.252 L187.211,165H226v176.459l-27.48,42.221c-3.062,4.6-3.354,10.518-0.747,15.396S205.463,407,211,407h90 c5.537,0,10.62-3.047,13.228-7.925c2.608-4.878,2.314-10.796-0.747-15.396L286,341.459V165h38.789l25.605,25.605 c4.307,4.307,10.781,5.596,16.348,3.252c5.61-2.314,9.258-7.793,9.258-13.857v-60C376,111.709,369.291,105,361,105z"></path></g></g></svg>`
  }, {
    name: 'upload',
    title: 'Upload image',
    icon: `<svg id="Capa_1" x="0px" y="0px" viewBox="0 0 512 512" xml:space="preserve"><path d="M412.907,214.08C398.4,140.693,333.653,85.333,256,85.333c-61.653,0-115.093,34.987-141.867,86.08 C50.027,178.347,0,232.64,0,298.667c0,70.72,57.28,128,128,128h277.333C464.213,426.667,512,378.88,512,320 C512,263.68,468.16,218.027,412.907,214.08z M298.667,277.333v85.333h-85.333v-85.333h-64L256,170.667l106.667,106.667H298.667z"></path></svg>`
  }, {
    name: 'background',
    title: 'Canvas option',
    icon: `<svg height="512pt" viewBox="0 0 512 512" width="512pt"><path d="m499.953125 197.703125-39.351563-8.554687c-3.421874-10.476563-7.660156-20.695313-12.664062-30.539063l21.785156-33.886719c3.890625-6.054687 3.035156-14.003906-2.050781-19.089844l-61.304687-61.304687c-5.085938-5.085937-13.035157-5.941406-19.089844-2.050781l-33.886719 21.785156c-9.84375-5.003906-20.0625-9.242188-30.539063-12.664062l-8.554687-39.351563c-1.527344-7.03125-7.753906-12.046875-14.949219-12.046875h-86.695312c-7.195313 0-13.421875 5.015625-14.949219 12.046875l-8.554687 39.351563c-10.476563 3.421874-20.695313 7.660156-30.539063 12.664062l-33.886719-21.785156c-6.054687-3.890625-14.003906-3.035156-19.089844 2.050781l-61.304687 61.304687c-5.085937 5.085938-5.941406 13.035157-2.050781 19.089844l21.785156 33.886719c-5.003906 9.84375-9.242188 20.0625-12.664062 30.539063l-39.351563 8.554687c-7.03125 1.53125-12.046875 7.753906-12.046875 14.949219v86.695312c0 7.195313 5.015625 13.417969 12.046875 14.949219l39.351563 8.554687c3.421874 10.476563 7.660156 20.695313 12.664062 30.539063l-21.785156 33.886719c-3.890625 6.054687-3.035156 14.003906 2.050781 19.089844l61.304687 61.304687c5.085938 5.085937 13.035157 5.941406 19.089844 2.050781l33.886719-21.785156c9.84375 5.003906 20.0625 9.242188 30.539063 12.664062l8.554687 39.351563c1.527344 7.03125 7.753906 12.046875 14.949219 12.046875h86.695312c7.195313 0 13.421875-5.015625 14.949219-12.046875l8.554687-39.351563c10.476563-3.421874 20.695313-7.660156 30.539063-12.664062l33.886719 21.785156c6.054687 3.890625 14.003906 3.039063 19.089844-2.050781l61.304687-61.304687c5.085937-5.085938 5.941406-13.035157 2.050781-19.089844l-21.785156-33.886719c5.003906-9.84375 9.242188-20.0625 12.664062-30.539063l39.351563-8.554687c7.03125-1.53125 12.046875-7.753906 12.046875-14.949219v-86.695312c0-7.195313-5.015625-13.417969-12.046875-14.949219zm-152.160156 58.296875c0 50.613281-41.179688 91.792969-91.792969 91.792969s-91.792969-41.179688-91.792969-91.792969 41.179688-91.792969 91.792969-91.792969 91.792969 41.179688 91.792969 91.792969zm0 0"></path></svg>`
  }]

  const defaultExtendedButtons = [{
    name: 'undo',
    title: 'Undo',
    icon: `<svg id="Capa_1" x="0px" y="0px" viewBox="0 0 512.011 512.011" xml:space="preserve"><path d="M511.136,286.255C502.08,194.863,419.84,128.015,328,128.015H192v-80c0-6.144-3.52-11.744-9.056-14.432 c-5.568-2.656-12.128-1.952-16.928,1.92l-160,128C2.208,166.575,0,171.151,0,176.015s2.208,9.44,5.984,12.512l160,128 c2.912,2.304,6.464,3.488,10.016,3.488c2.368,0,4.736-0.512,6.944-1.568c5.536-2.688,9.056-8.288,9.056-14.432v-80h139.392 c41.856,0,80,30.08,84.192,71.712c4.832,47.872-32.704,88.288-79.584,88.288H208c-8.832,0-16,7.168-16,16v64 c0,8.832,7.168,16,16,16h128C438.816,480.015,521.472,391.151,511.136,286.255z"></path></svg>`
  }, {
    name: 'redo',
    title: 'Redo',
    icon: `<svg id="Capa_1" x="0px" y="0px" viewBox="0 0 512.011 512.011" xml:space="preserve" style="transform: scale(-1, 1);"><path d="M511.136,286.255C502.08,194.863,419.84,128.015,328,128.015H192v-80c0-6.144-3.52-11.744-9.056-14.432             c-5.568-2.656-12.128-1.952-16.928,1.92l-160,128C2.208,166.575,0,171.151,0,176.015s2.208,9.44,5.984,12.512l160,128             c2.912,2.304,6.464,3.488,10.016,3.488c2.368,0,4.736-0.512,6.944-1.568c5.536-2.688,9.056-8.288,9.056-14.432v-80h139.392             c41.856,0,80,30.08,84.192,71.712c4.832,47.872-32.704,88.288-79.584,88.288H208c-8.832,0-16,7.168-16,16v64             c0,8.832,7.168,16,16,16h128C438.816,480.015,521.472,391.151,511.136,286.255z"></path></svg>`
  }, {
    name: 'save',
    title: 'Save',
    icon: `<svg id="Capa_1" x="0px" y="0px" width="128px" height="128px" viewBox="0 0 490.434 490.433" xml:space="preserve"><g><path d="M472.003,58.36l-13.132-11.282c-21.798-18.732-54.554-16.644-73.799,4.697L165.39,295.359l-66.312-57.112 c-21.775-18.753-54.536-16.707-73.804,4.611l-11.611,12.848c-9.416,10.413-14.305,24.149-13.595,38.18 c0.717,14.023,6.973,27.188,17.402,36.6l121.553,111.311c10.524,9.883,24.628,15.037,39.044,14.272 c14.416-0.763,27.894-7.386,37.311-18.329l262.245-304.71c9.162-10.646,13.717-24.494,12.661-38.496 C489.229,80.522,482.655,67.512,472.003,58.36z"></path></g></svg>`
  }, {
    name: 'download',
    title: 'Download',
    icon: `<svg id="Capa_1" x="0px" y="0px" width="128px" height="128px" viewBox="0 0 512.171 512.171" xml:space="preserve"><g><g><path d="M479.046,283.925c-1.664-3.989-5.547-6.592-9.856-6.592H352.305V10.667C352.305,4.779,347.526,0,341.638,0H170.971 c-5.888,0-10.667,4.779-10.667,10.667v266.667H42.971c-4.309,0-8.192,2.603-9.856,6.571c-1.643,3.989-0.747,8.576,2.304,11.627 l212.8,213.504c2.005,2.005,4.715,3.136,7.552,3.136s5.547-1.131,7.552-3.115l213.419-213.504 C479.793,292.501,480.71,287.915,479.046,283.925z"></path></g></g></svg>`
  }, {
    name: 'clear',
    title: 'Clear',
    icon: `<svg width="128px" height="128px" viewBox="0 0 365.696 365.696"><path d="m243.1875 182.859375 113.132812-113.132813c12.5-12.5 12.5-32.765624 0-45.246093l-15.082031-15.082031c-12.503906-12.503907-32.769531-12.503907-45.25 0l-113.128906 113.128906-113.132813-113.152344c-12.5-12.5-32.765624-12.5-45.246093 0l-15.105469 15.082031c-12.5 12.503907-12.5 32.769531 0 45.25l113.152344 113.152344-113.128906 113.128906c-12.503907 12.503907-12.503907 32.769531 0 45.25l15.082031 15.082031c12.5 12.5 32.765625 12.5 45.246093 0l113.132813-113.132812 113.128906 113.132812c12.503907 12.5 32.769531 12.5 45.25 0l15.082031-15.082031c12.5-12.503906 12.5-32.769531 0-45.25zm0 0"></path></svg>`
  }]

  var toolbar = function () {
    const _self = this;
    let buttons = [];
    let extendedButtons = [];
    if (Array.isArray(this.buttons) && this.buttons.length) {
      defaultButtons.forEach(item => {
        if (this.buttons.includes(item.name)) buttons.push(item);
      });
      defaultExtendedButtons.forEach(item => {
        if (this.buttons.includes(item.name)) extendedButtons.push(item);
      })
    } else {
      buttons = defaultButtons;
      extendedButtons = defaultExtendedButtons;
    }

    try {
      this.containerEl.append(`<div class="toolbar" id="toolbar"><div class="main-buttons"></div><div class="extended-buttons"></div></div>`);

      // main buttons
      (() => {
        buttons.forEach(item => {
          $(`${this.containerSelector} #toolbar .main-buttons`).append(`<button id="${item.name}">${item.icon}</button>`);
        })

        $(`${this.containerSelector} #toolbar .main-buttons button`).click(function () {
          let id = $(this).attr('id');

          $(`${_self.containerSelector} #toolbar button`).removeClass('active');
          $(`${_self.containerSelector} #toolbar button#${id}`).addClass('active');
          _self.setActiveTool(id);
        })
      })();

      // zoom
      (() => {
        let currentZoomLevel = 1;
        $(`${this.containerSelector}`).append(
          `<div class="floating-zoom-level-container"></div>`
        )
        $(`${this.containerSelector} .floating-zoom-level-container`).append(`
          <label>Zoom</label>
          <select id="input-zoom-level">
            ${[0.05, 0.1, 0.25, 0.5, 0.75, 1, 1.5, 2, 2.5, 3].map((item => 
              `<option value="${item}" ${item === currentZoomLevel ? 'selected':''}>${item*100}%</option>`
              ))}
          </select>
        `);
        $(`${this.containerSelector} .floating-zoom-level-container #input-zoom-level`).change(function () {
          let zoom = parseFloat($(this).val());
          typeof _self.applyZoom === 'function' && _self.applyZoom(zoom)
        })
      })();
      // extended buttons
      (() => {
        extendedButtons.forEach(item => {
          $(`${this.containerSelector} #toolbar .extended-buttons`).append(`<button id="${item.name}">${item.icon}</button>`);
        })

        $(`${this.containerSelector} #toolbar .extended-buttons button`).click(function () {
          let id = $(this).attr('id');
          if (id === 'save') {
            if (window.confirm('The current canvas will be saved in your local! Are you sure?')) {
              saveInBrowser.save('canvasEditor', _self.canvas.toJSON());
            }
          } else if (id === 'clear') {
            if (window.confirm('This will clear the canvas! Are you sure?')) {
              _self.canvas.clear(), saveInBrowser.remove('canvasEditor');
            }
          } else if (id === 'download') {
            $('body').append(`<div class="custom-modal-container">
              <div class="custom-modal-content">
                <div class="button-download" id="svg">Download as SVG</div>
                <div class="button-download" id="png">Download as PNG</div>
                <div class="button-download" id="jpg">Download as JPG</div>
              </div>
            </div>`)

            $(".custom-modal-container").click(function () {
              $(this).remove();
            })

            $(".custom-modal-container .button-download").click(function (e) {
              let type = $(this).attr('id');
              if (type === 'svg') downloadSVG(_self.canvas.toSVG());
              else if (type === 'png') downloadImage(_self.canvas.toDataURL())
              else if (type === 'jpg') downloadImage(_self.canvas.toDataURL({
                format: 'jpeg'
              }), 'jpg', 'image/jpeg');
            })

          } else if (id === 'undo') _self.undo();
          else if (id === 'redo') _self.redo();
        })
      })()
    } catch (_) {
      console.error("can't create toolbar");
    }
  }

  window.ImageEditor.prototype.initializeToolbar = toolbar;
})();

/**
 * Define action to upload, drag & drop images into canvas
 */
(function () {
  var upload = function (canvas) {
    const _self = this;
    this.openDragDropPanel = function () {
      console.log('open drag drop panel')
      $('body').append(`<div class="custom-modal-container">
        <div class="custom-modal-content">
          <div class="drag-drop-input">
            <div>Drag & drop files<br>or click to browse.<br>JPG, PNG or SVG only!</div>
          </div>
        </div>
      </div>`)
      $('.custom-modal-container').click(function () {
        $(this).remove()
      })

      $('.drag-drop-input').click(function () {
        console.log('click drag drop')
        $(`${_self.containerSelector} #btn-image-upload`).click();
      })

      $(".drag-drop-input").on("dragover", function (event) {
        event.preventDefault();
        event.stopPropagation();
        $(this).addClass('dragging');
      });

      $(".drag-drop-input").on("dragleave", function (event) {
        event.preventDefault();
        event.stopPropagation();
        $(this).removeClass('dragging');
      });

      $(".drag-drop-input").on("drop", function (event) {
        event.preventDefault();
        event.stopPropagation();
        $(this).removeClass('dragging');
        if (event.originalEvent.dataTransfer) {
          if (event.originalEvent.dataTransfer.files.length) {
            let files = event.originalEvent.dataTransfer.files
            processFiles(files);
            $('.custom-modal-container').remove();
          }
        }
      });
    }

    const processFiles = (files) => {
      if (files.length === 0) return;
      const allowedTypes = ['image/jpeg', 'image/png', 'image/svg+xml']

      for (let file of files) {
        // check type
        if (!allowedTypes.includes(file.type)) continue

        let reader = new FileReader()

        // handle svg
        if (file.type === 'image/svg+xml') {
          reader.onload = (f) => {
            fabric.loadSVGFromString(f.target.result, (objects, options) => {
              let obj = fabric.util.groupSVGElements(objects, options)
              obj.set({
                left: 0,
                top: 0
              }).setCoords()
              canvas.add(obj)

              canvas.renderAll()
              canvas.trigger('object:modified')
            })
          }
          reader.readAsText(file)
          continue
        }

        // handle image, read file, add to canvas
        reader.onload = (f) => {
          fabric.Image.fromURL(f.target.result, (img) => {
            img.set({
              left: 0,
              top: 0
            })
            img.scaleToHeight(300)
            img.scaleToWidth(300)
            canvas.add(img)

            canvas.renderAll()
            canvas.trigger('object:modified')
          })
        }

        reader.readAsDataURL(file)
      }
    }

    this.containerEl.append(`<input id="btn-image-upload" type="file" accept="image/*" multiple hidden>`);
    document.querySelector(`${this.containerSelector} #btn-image-upload`).addEventListener('change', function (e) {
      if (e.target.files.length === 0) return;
      processFiles(e.target.files)
    })
  }

  window.ImageEditor.prototype.initializeUpload = upload;
})();

/**
 * Define action to zoom in/out by mouse+key events
 */
// keyboard shortcuts and zoom calculations
const minZoom = 0.05
const maxZoom = 3

// zoom with key
const zoomWithKeys = (e, canvas, applyZoom) => {
  const key = e.which || e.keyCode

  // ctr -: zoom out
  if (key === 189 && e.ctrlKey) {
    e.preventDefault()
    if (canvas.getZoom() === minZoom) return

    let updatedZoom = parseInt(canvas.getZoom() * 100)

    // 25% jumps
    if ((updatedZoom % 25) !== 0) {
      while ((updatedZoom % 25) !== 0) {
        updatedZoom = updatedZoom - 1
      }
    } else {
      updatedZoom = updatedZoom - 25
    }

    updatedZoom = updatedZoom / 100
    updatedZoom = (updatedZoom <= 0) ? minZoom : updatedZoom

    applyZoom(updatedZoom)
  }


  // ctr +: zoom in
  if (key === 187 && e.ctrlKey) {
    e.preventDefault()
    if (canvas.getZoom() === maxZoom) return

    let updatedZoom = parseInt(canvas.getZoom() * 100)

    // 25% jumps
    if ((updatedZoom % 25) !== 0) {
      while ((updatedZoom % 25) !== 0) {
        updatedZoom = updatedZoom + 1
      }
    } else {
      updatedZoom = updatedZoom + 25
    }

    updatedZoom = updatedZoom / 100
    updatedZoom = (updatedZoom > maxZoom) ? maxZoom : updatedZoom

    applyZoom(updatedZoom)
  }


  // ctr 0: reset
  if ((key === 96 || key === 48 || key === 192) && e.ctrlKey) {
    e.preventDefault()
    applyZoom(1)
  }
}

// zoom with mouse
const zoomWithMouse = (e, canvas, applyZoom) => {
  if (!e.ctrlKey) return
  e.preventDefault()

  let updatedZoom = canvas.getZoom().toFixed(2)
  let zoomAmount = (e.deltaY > 0) ? -5 : 5
  updatedZoom = ((updatedZoom * 100) + zoomAmount) / 100
  if (updatedZoom < minZoom || updatedZoom > maxZoom) return

  applyZoom(updatedZoom)
}

/**
 * Define util functions
 */

/**
 * Get fabric js gradient from colorstops, orientation and angle
 * @param {Array} handlers array of color stops
 * @param {Number} width gradient width
 * @param {Number} height gradient height
 * @param {String} orientation orientation type linear/radial
 * @param {Number} angle the angle of linear gradient
 */
const generateFabricGradientFromColorStops = (handlers, width, height, orientation, angle) => {
  const gradAngleToCoords = (angle) => {
    let anglePI = (-parseInt(angle, 10)) * (Math.PI / 180)
    let angleCoords = {
      'x1': (Math.round(50 + Math.sin(anglePI) * 50)) / 100,
      'y1': (Math.round(50 + Math.cos(anglePI) * 50)) / 100,
      'x2': (Math.round(50 + Math.sin(anglePI + Math.PI) * 50)) / 100,
      'y2': (Math.round(50 + Math.cos(anglePI + Math.PI) * 50)) / 100,
    }

    return angleCoords
  }

  let bgGradient = {};
  let colorStops = [];

  for (var i in handlers) {
    colorStops.push({
      id: i,
      color: handlers[i].color,
      offset: handlers[i].position / 100,
    })
  }

  if (orientation === 'linear') {
    let angleCoords = gradAngleToCoords(angle)
    bgGradient = new fabric.Gradient({
      type: 'linear',
      coords: {
        x1: angleCoords.x1 * width,
        y1: angleCoords.y1 * height,
        x2: angleCoords.x2 * width,
        y2: angleCoords.y2 * height
      },
      colorStops,
    })
  } else if (orientation === 'radial') {
    bgGradient = new fabric.Gradient({
      type: 'radial',
      coords: {
        x1: width / 2,
        y1: height / 2,
        r1: 0,
        x2: width / 2,
        y2: height / 2,
        r2: width / 2
      },
      colorStops: colorStops
    });
  }

  return bgGradient
}

const getRealBBox = async (obj) => {

  let tempCanv, ctx, w, h;

  // we need to use a temp canvas to get imagedata
  const getImageData = (dataUrl) => {
    if (tempCanv == null) {
      tempCanv = document.createElement('canvas');
      tempCanv.style.border = '1px solid blue';
      tempCanv.style.position = 'absolute';
      tempCanv.style.top = '-100%';
      tempCanv.style.visibility = 'hidden';
      ctx = tempCanv.getContext('2d');
      document.body.appendChild(tempCanv);
    }

    return new Promise(function (resolve, reject) {
      if (dataUrl == null) return reject();

      var image = new Image();
      image.addEventListener('load', () => {
        w = image.width;
        h = image.height;
        tempCanv.width = w;
        tempCanv.height = h;
        ctx.drawImage(image, 0, 0, w, h);
        var imageData = ctx.getImageData(0, 0, w, h).data.buffer;
        resolve(imageData, false);
      });
      image.src = dataUrl;
    });
  }


  // analyze pixels 1-by-1
  const scanPixels = (imageData) => {
    var data = new Uint32Array(imageData),
      x, y, y1, y2, x1 = w,
      x2 = 0;

    // y1
    for (y = 0; y < h; y++) {
      for (x = 0; x < w; x++) {
        if (data[y * w + x] & 0xff000000) {
          y1 = y;
          y = h;
          break;
        }
      }
    }

    // y2
    for (y = h - 1; y > y1; y--) {
      for (x = 0; x < w; x++) {
        if (data[y * w + x] & 0xff000000) {
          y2 = y;
          y = 0;
          break;
        }
      }
    }

    // x1
    for (y = y1; y < y2; y++) {
      for (x = 0; x < w; x++) {
        if (x < x1 && data[y * w + x] & 0xff000000) {
          x1 = x;
          break;
        }
      }
    }

    // x2
    for (y = y1; y < y2; y++) {
      for (x = w - 1; x > x1; x--) {
        if (x > x2 && data[y * w + x] & 0xff000000) {
          x2 = x;
          break;
        }
      }
    }

    return {
      x1: x1,
      x2: x2,
      y1: y1,
      y2: y2,
      width: x2 - x1,
      height: y2 - y1
    }
  }

  let data = await getImageData(obj.toDataURL());

  return scanPixels(data);

}

/**
 * Align objects on canvas according to the pos
 * @param {Object} canvas fabric js canvas
 * @param {Array} activeSelection the array of fabric js objects
 * @param {String} pos the position to align left/center-h/right/top/center-v/bottom
 */
const alignObject = (canvas, activeSelection, pos) => {
  switch (pos) {
    case 'left':

      (async () => {
        let bound = activeSelection.getBoundingRect()
        let realBound = await getRealBBox(activeSelection)
        activeSelection.set('left', (activeSelection.left - bound.left - realBound.x1))
        activeSelection.setCoords()
        canvas.renderAll()
        canvas.trigger('object:modified')
      })()

      break

    case 'center-h':

      (async () => {
        let bound = activeSelection.getBoundingRect()
        let realBound = await getRealBBox(activeSelection)
        activeSelection.set(
          'left',
          (activeSelection.left - bound.left - realBound.x1) + (canvas.width / 2) - (realBound.width / 2)
        )
        activeSelection.setCoords()
        canvas.renderAll()
        canvas.trigger('object:modified')
      })()

      break

    case 'right':

      (async () => {
        let bound = activeSelection.getBoundingRect()
        let realBound = await getRealBBox(activeSelection)
        activeSelection.set('left', (activeSelection.left - bound.left - realBound.x1) + canvas.width - realBound.width)
        activeSelection.setCoords()
        canvas.renderAll()
        canvas.trigger('object:modified')
      })()

      break

    case 'top':

      (async () => {
        let bound = activeSelection.getBoundingRect()
        let realBound = await getRealBBox(activeSelection)
        activeSelection.set('top', (activeSelection.top - bound.top - realBound.y1))
        activeSelection.setCoords()
        canvas.renderAll()
        canvas.trigger('object:modified')
      })()

      break

    case 'center-v':

      (async () => {
        let bound = activeSelection.getBoundingRect()
        let realBound = await getRealBBox(activeSelection)
        activeSelection.set(
          'top',
          (activeSelection.top - bound.top - realBound.y1) + (canvas.height / 2) - (realBound.height / 2)
        )
        activeSelection.setCoords()
        canvas.renderAll()
        canvas.trigger('object:modified')
      })()

      break

    case 'bottom':

      (async () => {
        let bound = activeSelection.getBoundingRect()
        let realBound = await getRealBBox(activeSelection)
        activeSelection.set(
          'top',
          (activeSelection.top - bound.top - realBound.y1) + (canvas.height - realBound.height)
        )
        activeSelection.setCoords()
        canvas.renderAll()
        canvas.trigger('object:modified')
      })()

      break

    default:
      break
  }
}

/**
 * Get the filters of current image selection
 * @param {Object} activeSelection fabric js object
 */
const getCurrentEffect = (activeSelection) => {
  let updatedEffects = {
    opacity: 100,
    blur: 0,
    brightness: 50,
    saturation: 50,
    gamma: {
      r: 45,
      g: 45,
      b: 45
    }
  }

  updatedEffects.opacity = activeSelection.opacity * 100

  let hasBlur = activeSelection.filters.find(x => x.blur)
  if (hasBlur) {
    updatedEffects.blur = hasBlur.blur * 100
  }

  let hasBrightness = activeSelection.filters.find(x => x.brightness)
  if (hasBrightness) {
    updatedEffects.brightness = ((hasBrightness.brightness + 1) / 2) * 100
  }

  let hasSaturation = activeSelection.filters.find(x => x.saturation)
  if (hasSaturation) {
    updatedEffects.saturation = ((hasSaturation.saturation + 1) / 2) * 100
  }

  let hasGamma = activeSelection.filters.find(x => x.gamma)
  if (hasGamma) {
    updatedEffects.gamma.r = Math.round(hasGamma.gamma[0] / 0.022)
    updatedEffects.gamma.g = Math.round(hasGamma.gamma[1] / 0.022)
    updatedEffects.gamma.b = Math.round(hasGamma.gamma[2] / 0.022)
  }

  return updatedEffects;
}

const getUpdatedFilter = (effects, effect, value) => {
  let updatedEffects = {
    ...effects
  }
  switch (effect) {
    case 'gamma.r':
      updatedEffects.gamma.r = value
      break
    case 'gamma.g':
      updatedEffects.gamma.g = value
      break
    case 'gamma.b':
      updatedEffects.gamma.b = value
      break

    default:
      updatedEffects[effect] = value
      break
  }

  effects = updatedEffects;

  // rebuild filter array, calc values for fabric
  // blur 0-1 (def val 0), brightness, saturation -1-1 (def val: 0), gamma 0-2.2 (def val: 1)
  let updatedFilters = []

  if (effects.blur > 0) {
    updatedFilters.push(new fabric.Image.filters.Blur({
      blur: effects.blur / 100
    }));
  }

  if (effects.brightness !== 50) {
    updatedFilters.push(new fabric.Image.filters.Brightness({
      brightness: ((effects.brightness / 100) * 2) - 1
    }));
  }

  if (effects.saturation !== 50) {
    updatedFilters.push(new fabric.Image.filters.Saturation({
      saturation: ((effects.saturation / 100) * 2) - 1
    }));
  }

  if (
    effects.gamma.r !== 45 ||
    effects.gamma.g !== 45 ||
    effects.gamma.b !== 45
  ) {
    updatedFilters.push(new fabric.Image.filters.Gamma({
      gamma: [
        Math.round((effects.gamma.r * 0.022) * 10) / 10,
        Math.round((effects.gamma.g * 0.022) * 10) / 10,
        Math.round((effects.gamma.b * 0.022) * 10) / 10
      ]
    }));
  }

  return updatedFilters;
}

const getActiveFontStyle = (activeSelection, styleName) => {
  if (activeSelection.getSelectionStyles && activeSelection.isEditing) {
    let styles = activeSelection.getSelectionStyles()
    if (styles.find(o => o[styleName] === '')) {
      return ''
    }

    return styles[0][styleName]
  }

  return activeSelection[styleName] || ''
}


const setActiveFontStyle = (activeSelection, styleName, value) => {
  if (activeSelection.setSelectionStyles && activeSelection.isEditing) {
    let style = {}
    style[styleName] = value;
    activeSelection.setSelectionStyles(style)
    activeSelection.setCoords()
  } else {
    activeSelection.set(styleName, value)
  }
}

const downloadImage = (data, extension = 'png', mimeType = 'image/png') => {
  const imageData = data.toString().replace(/^data:image\/(png|jpeg|jpg);base64,/, '');
  const byteCharacters = atob(imageData);
  const byteNumbers = new Array(byteCharacters.length);
  for (let i = 0; i < byteCharacters.length; i += 1) {
    byteNumbers[i] = byteCharacters.charCodeAt(i);
  }
  const byteArray = new Uint8Array(byteNumbers);
  const file = new Blob([byteArray], {
    type: mimeType + ';base64'
  });
  const fileURL = window.URL.createObjectURL(file);

  // IE doesn't allow using a blob object directly as link href
  // instead it is necessary to use msSaveOrOpenBlob
  if (window.navigator && window.navigator.msSaveOrOpenBlob) {
    window.navigator.msSaveOrOpenBlob(file);
    return;
  }
  const link = document.createElement('a');
  link.href = fileURL;
  link.download = 'image.' + extension;
  link.dispatchEvent(new MouseEvent('click'));
  setTimeout(() => {
    // for Firefox it is necessary to delay revoking the ObjectURL
    window.URL.revokeObjectURL(fileURL);
  }, 60);
}


const downloadSVG = (SVGmarkup) => {
  const url = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(SVGmarkup);

  const link = document.createElement('a');
  link.href = url;
  link.download = 'image.svg';
  link.dispatchEvent(new MouseEvent('click'));
  setTimeout(() => {
    // for Firefox it is necessary to delay revoking the ObjectURL
    window.URL.revokeObjectURL(url);
  }, 60);
}

/**
 * Define utils to save/load canvas status with local storage
 */
window.saveInBrowser = {
  save: (name, value) => {
    // if item is an object, stringify
    if (value instanceof Object) {
      value = JSON.stringify(value);
    }

    localStorage.setItem(name, value);
  },
  load: (name) => {
    let value = localStorage.getItem(name);
    value = JSON.parse(value);

    return value;
  },
  remove: (name) => {
    localStorage.removeItem(name);
  }
}