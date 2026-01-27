
    // --- Editor Elements ---
    const editorArea = document.getElementById('editor-area');
    const editorControls = document.getElementById('editor-controls');
    const btnAddText = document.getElementById('btn-add-text');
    const btnAddRect = document.getElementById('btn-add-rect');
    const editorColor = document.getElementById('editor-color');
    const btnDeleteObj = document.getElementById('btn-delete-obj');
    const btnPrevPage = document.getElementById('btn-prev-page');
    const btnNextPage = document.getElementById('btn-next-page');
    const pageIndicator = document.getElementById('page-indicator');
    
    // --- Editor State ---
    let fabricCanvas = null;
    let editorPages = []; // Stores Fabric JSON state per page: { pageIndex: number, fabricJSON: object }
    let currentEditorPageIndex = 0;
    let currentEditorPdfJsDoc = null;
    let currentEditorFile = null; // The file object being edited

    // --- Editor Logic ---
    function initializeEditor() {
        if (fabricCanvas) {
            fabricCanvas.dispose();
        }
        fabricCanvas = new fabric.Canvas('fabric-canvas');
        
        // Canvas Events
        fabricCanvas.on('selection:created', updateEditorControls);
        fabricCanvas.on('selection:updated', updateEditorControls);
        fabricCanvas.on('selection:cleared', updateEditorControls);
    }
    
    function updateEditorControls() {
        const activeObj = fabricCanvas.getActiveObject();
        if (activeObj) {
            // Update color picker to match active object
            editorColor.value = activeObj.fill || '#000000';
            btnDeleteObj.disabled = false;
        } else {
            btnDeleteObj.disabled = true;
        }
    }

    btnAddText.addEventListener('click', () => {
        const text = new fabric.IText('テキスト入力', {
            left: 100,
            top: 100,
            fontFamily: 'Noto Sans JP', // Use a font that we can embed
            fill: editorColor.value,
            fontSize: 20
        });
        fabricCanvas.add(text);
        fabricCanvas.setActiveObject(text);
    });

    btnAddRect.addEventListener('click', () => {
        const rect = new fabric.Rect({
            left: 150,
            top: 150,
            fill: 'transparent',
            stroke: editorColor.value,
            strokeWidth: 3,
            width: 100,
            height: 100
        });
        fabricCanvas.add(rect);
        fabricCanvas.setActiveObject(rect);
    });

    editorColor.addEventListener('input', (e) => {
        const color = e.target.value;
        const activeObj = fabricCanvas.getActiveObject();
        if (activeObj) {
            if (activeObj.type === 'rect') {
                activeObj.set('stroke', color);
            } else {
                activeObj.set('fill', color);
            }
            fabricCanvas.requestRenderAll();
        }
    });

    btnDeleteObj.addEventListener('click', () => {
        const activeObj = fabricCanvas.getActiveObject();
        if (activeObj) {
            fabricCanvas.remove(activeObj);
            fabricCanvas.discardActiveObject();
            updateEditorControls();
        }
    });

    // Pagination Logic for Editor
    async function loadEditorPage(index) {
         // Save current page state before switching
        if (currentEditorPageIndex >= 0 && editorPages[currentEditorPageIndex]) {
             editorPages[currentEditorPageIndex].fabricJSON = fabricCanvas.toJSON();
        }

        currentEditorPageIndex = index;
        const page = await currentEditorPdfJsDoc.getPage(index + 1);
        const viewport = page.getViewport({ scale: 1.5 }); // Good resolution for editing

        // Resize Canvas
        fabricCanvas.setWidth(viewport.width);
        fabricCanvas.setHeight(viewport.height);

        // Render PDF Page to Image
        const canvas = document.createElement('canvas');
        const context = canvas.getContext('2d');
        canvas.width = viewport.width;
        canvas.height = viewport.height;

        await page.render({ canvasContext: context, viewport: viewport }).promise;
        const imgData = canvas.toDataURL('image/jpeg', 0.8);

        // Set as Background
        fabric.Image.fromURL(imgData, (img) => {
             // Basic settings for background
            img.set({
                originX: 'left', 
                originY: 'top',
                selectable: false,
                evented: false
            });
            fabricCanvas.setBackgroundImage(img, fabricCanvas.renderAll.bind(fabricCanvas));
        });

        // Restore objects if revisited
        fabricCanvas.clear(); 
        
        if (!editorPages[index]) {
            editorPages[index] = { pageIndex: index, fabricJSON: null };
        } else if (editorPages[index].fabricJSON) {
            fabricCanvas.loadFromJSON(editorPages[index].fabricJSON, () => {
            });
        }
        
        // Update UI
        pageIndicator.textContent = `Page ${index + 1} / ${currentEditorPdfJsDoc.numPages}`;
        btnPrevPage.disabled = index === 0;
        btnNextPage.disabled = index === currentEditorPdfJsDoc.numPages - 1;
    }

    // Wrap loadEditorPage logic involving JSON cleanly
    async function switchEditorPage(newIndex) {
         // 1. Save current state (without background to save memory/complexity)
        const json = fabricCanvas.toJSON(['id', 'selectable']); 
        // Remove background image from JSON to avoid duplicating huge string
        delete json.backgroundImage; 
        
        editorPages[currentEditorPageIndex] = { 
            pageIndex: currentEditorPageIndex, 
            fabricJSON: json 
        };

        // 2. Load new page
        currentEditorPageIndex = newIndex;
        await renderEditorPage(newIndex);
    }

    async function renderEditorPage(index) {
        const page = await currentEditorPdfJsDoc.getPage(index + 1);
        const viewport = page.getViewport({ scale: 1.5 });

        fabricCanvas.setWidth(viewport.width);
        fabricCanvas.setHeight(viewport.height);
        fabricCanvas.clear();

        // Render PDF Background
        const canvas = document.createElement('canvas');
        const context = canvas.getContext('2d');
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        await page.render({ canvasContext: context, viewport: viewport }).promise;
        
        const imgEl = new Image();
        imgEl.src = canvas.toDataURL('image/jpeg', 0.8);
        
        imgEl.onload = () => {
            const fImg = new fabric.Image(imgEl);
            fabricCanvas.setBackgroundImage(fImg, fabricCanvas.renderAll.bind(fabricCanvas));
            
            // Restore Objects
            if (editorPages[index] && editorPages[index].fabricJSON) {
                fabricCanvas.loadFromJSON(editorPages[index].fabricJSON, () => {
                    fabricCanvas.setBackgroundImage(fImg, fabricCanvas.renderAll.bind(fabricCanvas));
                });
            }
        };

        pageIndicator.textContent = `Page ${index + 1} / ${currentEditorPdfJsDoc.numPages}`;
        btnPrevPage.disabled = index === 0;
        btnNextPage.disabled = index === currentEditorPdfJsDoc.numPages - 1;
    }

    btnPrevPage.addEventListener('click', () => {
        if (currentEditorPageIndex > 0) {
            switchEditorPage(currentEditorPageIndex - 1);
        }
    });

    btnNextPage.addEventListener('click', () => {
        if (currentEditorPageIndex < currentEditorPdfJsDoc.numPages - 1) {
            switchEditorPage(currentEditorPageIndex + 1);
        }
    });
    
    // --- Save Edited PDF ---
    async function saveEditedPDF() {
        // Save functionality
         // 1. Save current page state first
        const json = fabricCanvas.toJSON(); 
        delete json.backgroundImage;
        editorPages[currentEditorPageIndex] = { fabricJSON: json };

        try {
            const pdfDoc = await PDFLib.PDFDocument.load(currentEditorFile.data);
            
            // Register fontkit
            pdfDoc.registerFontkit(fontkit);
            
            // Load Japanese Font
            const fontUrl = 'https://fonts.gstatic.com/s/notosansjp/v52/-F6jfjtqLzI2JPCgQBnw7HFyzSD-AsregP8VFBEj75s.woff2';
            
            let customFont = null;
            try {
                const fontBytes = await fetch(fontUrl).then(res => res.arrayBuffer());
                customFont = await pdfDoc.embedFont(fontBytes);
            } catch (e) {
                console.warn("Could not load JP font, falling back to standard.", e);
                alert("日本語フォントの読み込みに失敗しました。標準フォントを使用するため、日本語が文字化けする可能性があります。");
            }

            const pages = pdfDoc.getPages();

            for (let i = 0; i < pages.length; i++) {
                if (!editorPages[i] || !editorPages[i].fabricJSON) continue;

                const page = pages[i];
                const { width, height } = page.getSize();
                
                // Fabric Canvas Dimensions (Scale 1.5)
                // We need to scale coordinates back to PDF size (Scale 1.0)
                // Viewport scale was 1.5
                const scaleFactor = 1 / 1.5; 

                const fabricData = editorPages[i].fabricJSON;
                
                if (fabricData.objects) {
                    for (const obj of fabricData.objects) {
                        if (obj.type === 'i-text' || obj.type === 'text') {
                            const fontSize = obj.fontSize * scaleFactor;
                            const x = obj.left * scaleFactor;
                            const y = height - (obj.top * scaleFactor) - (obj.height * scaleFactor); 

                            page.drawText(obj.text, {
                                x: x,
                                y: height - (obj.top * scaleFactor) - (fontSize), // Approximate fix
                                size: fontSize,
                                font: customFont || undefined, // undefined uses StandardFont usually? No, must specify if not default.
                                color: hexToRgb(obj.fill)
                            });
                        } else if (obj.type === 'rect') {
                            page.drawRectangle({
                                x: obj.left * scaleFactor,
                                y: height - (obj.top * scaleFactor) - (obj.height * scaleFactor * obj.scaleY),
                                width: obj.width * scaleFactor * obj.scaleX,
                                height: obj.height * scaleFactor * obj.scaleY,
                                borderColor: hexToRgb(obj.stroke),
                                borderWidth: obj.strokeWidth * scaleFactor,
                                color: undefined, // Transparent fill
                            });
                        }
                    }
                }
            }

            const pdfBytes = await pdfDoc.save();
            downloadFile(pdfBytes, "edited_output.pdf");

        } catch (err) {
            console.error(err);
            alert("保存に失敗しました: " + err.message);
        }
    }

    function hexToRgb(hex) {
        if (!hex) return undefined;
        // Expand shorthand form (e.g. "03F") to full form (e.g. "0033FF")
        var shorthandRegex = /^#?([a-f\d])([a-f\d])([a-f\d])$/i;
        hex = hex.replace(shorthandRegex, function(m, r, g, b) {
            return r + r + g + g + b + b;
        });

        var result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
        return result ? PDFLib.rgb(
            parseInt(result[1], 16) / 255,
            parseInt(result[2], 16) / 255,
            parseInt(result[3], 16) / 255
        ) : undefined;
    }
