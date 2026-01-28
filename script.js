document.addEventListener('DOMContentLoaded', () => {
    // --- Fabric.js Extension: Textbox Box Border & Height & Vertical Align ---
    if (typeof fabric !== 'undefined') {
        // 1. テキストボックスの高さ計算をオーバーライド
        const originalCalcTextHeight = fabric.Textbox.prototype.calcTextHeight;
        fabric.Textbox.prototype.calcTextHeight = function () {
            const textHeight = originalCalcTextHeight.call(this);
            // ★重要: 実際の文字の高さをプロパティとして保存（垂直揃え計算用）
            this.__actualTextHeight = textHeight;
            // boxHeightが設定されていれば、その高さを最低値として使用する
            return Math.max(textHeight, this.boxHeight || 0);
        };

        // 2. テキスト描画処理をオーバーライドして垂直位置をずらす
        const originalRenderText = fabric.Textbox.prototype._renderText;
        fabric.Textbox.prototype._renderText = function (ctx) {
            // boxHeightがあり、かつ文字の高さより箱の方が大きい場合のみ調整
            if (this.boxHeight > this.__actualTextHeight && this.verticalAlign) {
                let yOffset = 0;
                const emptySpace = this.boxHeight - this.__actualTextHeight;

                if (this.verticalAlign === 'middle') {
                    yOffset = emptySpace / 2;
                } else if (this.verticalAlign === 'bottom') {
                    yOffset = emptySpace;
                }

                // コンテキストをずらして描画
                ctx.save();
                ctx.translate(0, yOffset);
                originalRenderText.call(this, ctx);
                ctx.restore();
            } else {
                // 通常描画
                originalRenderText.call(this, ctx);
            }
        };

        // 3. 背景と枠線の描画処理
        fabric.Textbox.prototype._renderBackground = function (ctx) {
            if (this.backgroundColor) {
                ctx.fillStyle = this.backgroundColor;
                ctx.fillRect(
                    -this.width / 2,
                    -this.height / 2,
                    this.width,
                    this.height
                );
            }
            // ボックスの枠線描画
            if (this.boxBorderWidth > 0 && this.boxBorderColor) {
                ctx.strokeStyle = this.boxBorderColor;
                ctx.lineWidth = this.boxBorderWidth;
                ctx.strokeRect(
                    -this.width / 2,
                    -this.height / 2,
                    this.width,
                    this.height
                );
            }
        };
    }
    // --- Elements ---
    const dropZone = document.getElementById('drop-zone');
    const fileInput = document.getElementById('file-input');
    const previewArea = document.getElementById('preview-area');
    const toolbar = document.getElementById('toolbar');
    const btnClear = document.getElementById('btn-clear');

    // Mode Selection Elements
    const modeSelection = document.getElementById('mode-selection');
    const workspace = document.getElementById('workspace');
    const workspaceTitle = document.getElementById('workspace-title');
    const btnBack = document.getElementById('btn-back');
    const actionButtonsContainer = document.getElementById('action-buttons');

    // --- Editor Elements (Active) ---
    const editorArea = document.getElementById('editor-area');
    const btnAddText = document.getElementById('btn-add-text');
    // btnAddRect は削除済みのため取得しない

    // Pagination
    const btnPrevPage = document.getElementById('btn-prev-page');
    const btnNextPage = document.getElementById('btn-next-page');
    const pageIndicator = document.getElementById('page-indicator');

    // Header Controls
    const editHeaderControls = document.getElementById('edit-header-controls');
    const editActionButtons = document.getElementById('edit-action-buttons');
    const btnZoomIn = document.getElementById('btn-zoom-in');
    const btnZoomOut = document.getElementById('btn-zoom-out');
    const zoomLevelText = document.getElementById('zoom-level-text');
    const canvasWrapper = document.getElementById('canvas-wrapper');

    // Floating Toolbar Elements
    const floatingToolbar = document.getElementById('floating-toolbar');
    const floatFontSize = document.getElementById('float-font-size');
    const floatStrokeWidth = document.getElementById('float-stroke-width');

    // Toolbar Tools
    const btnBold = document.getElementById('btn-bold');
    const btnItalic = document.getElementById('btn-italic');
    const btnUnderline = document.getElementById('btn-underline');
    const btnAlignLeft = document.getElementById('btn-align-left');
    const btnAlignCenter = document.getElementById('btn-align-center');
    const btnAlignRight = document.getElementById('btn-align-right');
    // ★追加
    const btnValignTop = document.getElementById('btn-valign-top');
    const btnValignMiddle = document.getElementById('btn-valign-middle');
    const btnValignBottom = document.getElementById('btn-valign-bottom');
    const btnDeleteObj = document.getElementById('btn-delete-obj');

    const toolbarTextTools = document.getElementById('toolbar-text-tools');
    const toolbarShapeTools = document.getElementById('toolbar-shape-tools');

    // Color Popups
    const btnTextColorTrigger = document.getElementById('btn-text-color-trigger');
    const popupTextColor = document.getElementById('popup-text-color');
    const floatTextColor = document.getElementById('float-text-color');
    const indicatorTextColor = document.getElementById('indicator-text-color');

    const btnBgColorTrigger = document.getElementById('btn-bg-color-trigger');
    const popupBgColor = document.getElementById('popup-bg-color');
    const floatBgColor = document.getElementById('float-bg-color');
    const bgOpacity = document.getElementById('bg-opacity');
    const indicatorBgColor = document.getElementById('indicator-bg-color');

    // --- 追加: 定義漏れしていたボーダー関連の要素 ---
    const floatBorderColor = document.getElementById('float-border-color');
    const indicatorBorderColor = document.getElementById('indicator-border-color');
    const popupBorderColor = document.getElementById('popup-border-color');
    const btnBorderColorTrigger = document.getElementById('btn-border-color-trigger');

    // Shape Menu Elements
    const btnAddShapeTrigger = document.getElementById('btn-add-shape-trigger');
    const popupAddShape = document.getElementById('popup-add-shape');
    const btnShapeRect = document.getElementById('btn-shape-rect');
    const btnShapeCircle = document.getElementById('btn-shape-circle');
    const btnShapeTriangle = document.getElementById('btn-shape-triangle');

    // Undo/Redo
    const btnUndo = document.getElementById('btn-undo');
    const btnRedo = document.getElementById('btn-redo');





    // --- State ---
    let currentMode = null;
    let loadedFiles = [];
    let allPages = [];
    let currentZoomScale = 1.0;

    // --- Editor State ---
    let fabricCanvas = null;
    let editorPages = [];
    let currentEditorPageIndex = 0;
    let currentEditorPdfJsDoc = null;
    let currentEditorFile = null;
    let editorPageMap = [];

    // Drawing State (Moved to top)
    let currentEditorTool = 'select'; // 'select', 'text', 'rect', 'circle', 'triangle'
    let isDrawing = false;
    let startX = 0;
    let startY = 0;
    let drawingObject = null;

    // Undo/Redo State
    let historyStack = [];
    let historyIndex = -1;
    let isHistoryLocked = false;


    // --- Mode Selection Logic ---
    document.querySelectorAll('.mode-card').forEach(card => {
        card.addEventListener('click', () => {
            const mode = card.dataset.mode;
            setMode(mode);
        });
    });

    btnBack.addEventListener('click', () => {
        resetApp();
        modeSelection.classList.remove('hidden');
        workspace.classList.add('hidden');
        currentMode = null;
    });

    function setMode(mode) {
        currentMode = mode;
        modeSelection.classList.add('hidden');
        workspace.classList.remove('hidden');

        // Reset UI for new mode
        loadedFiles = [];
        allPages = [];
        renderGrid();
        dropZone.classList.remove('hidden');
        toolbar.classList.add('hidden');

        currentZoomScale = 1.0;
        if (typeof updateZoomDisplay === 'function') updateZoomDisplay();


        // Set Title and Instructions
        switch (mode) {
            case 'merge':
                workspaceTitle.textContent = '結合 (Merge)';
                break;
            case 'split':
                workspaceTitle.textContent = '分割・抽出 (Split)';
                break;
            case 'reorder':
                workspaceTitle.textContent = '並べ替え・回転 (Reorder & Rotate)';
                break;
            case 'img2pdf':
                workspaceTitle.textContent = '画像をPDFに変換';
                fileInput.accept = ".jpg,.jpeg,.png"; // Change accept
                break;
            case 'pdf2img':
                workspaceTitle.textContent = 'PDFを画像に変換';
                break;
            case 'security':
                workspaceTitle.textContent = 'セキュリティ (パスワード設定)';
                break;
            case 'edit':
                workspaceTitle.textContent = 'PDFを編集';
                break;
        }

        updateActionButtons();
    }

    function updateActionButtons() {
        actionButtonsContainer.innerHTML = ''; // 下部ツールバーのクリア
        editActionButtons.innerHTML = '';      // ヘッダー内ボタンのクリア

        // 共通: まず両方隠す
        toolbar.classList.add('hidden');
        editHeaderControls.classList.add('hidden');

        if (currentMode === 'edit') {
            // --- 編集モード: ヘッダーを使用 ---

            // PDFを追加ボタン
            const btnAdd = createButton('add_to_photos', 'PDFを追加', () => {
                document.getElementById('file-input').click();
            });
            btnAdd.className = 'btn is-outlined';
            btnAdd.style.padding = '5px 10px';
            btnAdd.style.fontSize = '0.8rem';
            editActionButtons.appendChild(btnAdd);

            // 保存ボタン
            const btnSave = createButton('save', '保存', () => saveHandler());
            btnSave.className = 'btn is-primary';
            btnSave.style.padding = '5px 15px';
            btnSave.style.fontSize = '0.8rem';
            editActionButtons.appendChild(btnSave);

        } else {
            // --- 他のモード: 下部ツールバーを使用 ---

            // ページがなければツールバーは表示しない（ただし、ドラッグ＆ドロップ後は表示されるべき）
            // handleFilesで表示されるので、ここではボタン生成に集中

            if (loadedFiles.length > 0) {
                toolbar.classList.remove('hidden');
            }

            if (currentMode === 'merge') {
                const btn = createButton('merge_type', '結合して保存', () => saveHandler());
                btn.className = 'btn is-primary';
                actionButtonsContainer.appendChild(btn);

            } else if (currentMode === 'split') {
                const btn = createButton('content_cut', '選択ページを抽出して保存', () => saveHandler());
                btn.className = 'btn is-primary';
                actionButtonsContainer.appendChild(btn);
                addHint(' ※クリックして複数選択可');

            } else if (currentMode === 'reorder') {
                const btn = createButton('save', '現在の順序で保存', () => saveHandler());
                btn.className = 'btn is-primary';
                actionButtonsContainer.appendChild(btn);
                addHint(' ※ドラッグで順序変更、右下のボタンで回転');

            } else if (currentMode === 'img2pdf') {
                const btn = createButton('picture_as_pdf', 'PDFとして保存', () => saveHandler());
                btn.className = 'btn is-primary';
                actionButtonsContainer.appendChild(btn);

            } else if (currentMode === 'pdf2img') {
                const btnZip = createButton('photo_library', '画像をZIPで保存', () => saveHandler());
                btnZip.className = 'btn is-primary';
                actionButtonsContainer.appendChild(btnZip);

                // Workaround for Windows Security ZIP issues
                const btnSingle = createButton('collections', '1枚ずつ保存', () => saveHandler(true));
                btnSingle.className = 'btn is-outlined';
                btnSingle.style.marginLeft = '10px';
                actionButtonsContainer.appendChild(btnSingle);

                addHint(' ※ZIPが開けない場合は「1枚ずつ」をお試しください');

            } else if (currentMode === 'security') {
                const btn = createButton('lock', 'パスワードを設定して保存', () => {
                    // Open Password Modal instead of direct save
                    document.getElementById('password-modal').classList.remove('hidden');
                    document.getElementById('pdf-password').value = '';
                    document.getElementById('pdf-password').focus();
                });
                btn.className = 'btn is-primary';
                actionButtonsContainer.appendChild(btn);
            }
        }
    }

    function addHint(text) {
        const hint = document.createElement('span');
        hint.textContent = text;
        hint.style.fontSize = '0.8rem';
        hint.style.color = '#757575';
        hint.style.marginLeft = '10px';
        actionButtonsContainer.appendChild(hint);
    }

    // --- Save Handler Dispatcher ---
    async function saveHandler(isIndividual = false) {
        if (currentMode !== 'edit' && allPages.length === 0) return; // Edit mode checks inside saveEditedPDF

        if (currentMode === 'merge') {
            await savePDF(allPages, "merged-document.pdf");
        } else if (currentMode === 'split') {
            const selectedPages = allPages.filter(p => p.selected);
            if (selectedPages.length === 0) {
                alert("抽出するページを選択してください。");
                return;
            }
            await savePDF(selectedPages, "extracted-pages.pdf");
        } else if (currentMode === 'reorder') {
            await savePDF(allPages, "reordered.pdf");
        } else if (currentMode === 'img2pdf') {
            await saveImageToPDF(allPages, "images.pdf");
        } else if (currentMode === 'pdf2img') {
            if (isIndividual) {
                await savePDFToImagesIndividually(allPages);
            } else {
                await savePDFToImages(allPages, "images.zip");
            }
        } else if (currentMode === 'edit') {
            await saveEditedPDF();
        }
    }

    const passwordModal = document.getElementById('password-modal');
    document.getElementById('btn-cancel-pass').addEventListener('click', () => {
        passwordModal.classList.add('hidden');
    });

    document.getElementById('btn-save-pass').addEventListener('click', async () => {
        const password = document.getElementById('pdf-password').value;
        passwordModal.classList.add('hidden');
        // Save with password
        await savePDF(allPages, "secure-document.pdf", password);
    });

    function createButton(iconName, text, onClick) {
        const btn = document.createElement('button');
        btn.className = 'btn is-outlined'; // Default
        btn.innerHTML = `<i class="material-icons">${iconName}</i> ${text}`;
        btn.addEventListener('click', onClick);
        return btn;
    }

    function resetApp() {
        loadedFiles = [];
        allPages = [];
        // ★追加: 編集モード用のページマップもリセット
        editorPageMap = [];
        currentEditorPageIndex = 0;

        renderGrid();
        dropZone.classList.remove('hidden');
        dropZone.classList.remove('compact'); // Reset style
        toolbar.classList.add('hidden');
        // Clear file input value to allow re-selecting same file
        fileInput.value = '';
        fileInput.accept = ".pdf"; // Reset accept

        // Reset Editor
        editorArea.classList.add('hidden');
        previewArea.classList.remove('hidden');

        // nullチェック付きで非表示化
        if (typeof editorControls !== 'undefined' && editorControls) {
            editorControls.classList.add('hidden');
        } else {
            // editorControls変数が古くて参照できない場合のフォールバック
            const ctrls = document.getElementById('editor-controls');
            if (ctrls) ctrls.classList.add('hidden');
        }

        // ★追加: 編集用ヘッダーコントロールも隠す
        if (editHeaderControls) {
            editHeaderControls.classList.add("hidden");
        }

        editorPages = [];
        if (fabricCanvas) {
            fabricCanvas.dispose();
            fabricCanvas = null;
        }
    }

    // --- Drag & Drop Events ---
    dropZone.addEventListener('dragover', (e) => {
        e.preventDefault();
        dropZone.classList.add('drag-over');
    });

    dropZone.addEventListener('dragleave', () => {
        dropZone.classList.remove('drag-over');
    });

    dropZone.addEventListener('drop', (e) => {
        e.preventDefault();
        dropZone.classList.remove('drag-over');
        handleFiles(e.dataTransfer.files);
    });

    fileInput.addEventListener('change', (e) => {
        handleFiles(e.target.files);
    });

    async function handleFiles(files) {
        if (files.length === 0) return;

        toolbar.classList.remove('hidden');
        if (currentMode === 'edit') {
            toolbar.classList.add('hidden'); // Hide bottom toolbar in edit mode
        }
        dropZone.classList.add('compact');

        for (const file of files) {
            // Check allowed types based on mode
            if (currentMode === 'img2pdf') {
                if (!file.type.startsWith('image/')) {
                    alert(`"${file.name}" は画像ではありません。`);
                    continue;
                }
            } else {
                if (file.type !== 'application/pdf') {
                    alert(`"${file.name}" はPDFファイルではありません。スキップします。`);
                    continue;
                }
            }

            try {
                await processFile(file);
            } catch (err) {
                console.error("Error processing file:", err);
                alert(`"${file.name}" の読み込みに失敗しました。`);
            }
        }


        if (currentMode === 'edit') {

            // ★追加: ファイルがロードされたのでツールバーを表示する
            if (editHeaderControls) {
                editHeaderControls.classList.remove("hidden");
            }
            dropZone.classList.add('hidden');
            previewArea.classList.add('hidden');
            editorArea.classList.remove('hidden');
            editorArea.style.display = 'flex'; // Ensure flex layout


            // 読み込まれたファイルのうち、最新のものを取得（既存への追記用）
            // ★修正点2: loadedFilesの末尾（最新）を取得して追加処理へ回す
            const newFileIndex = loadedFiles.length - 1;
            const file = loadedFiles[newFileIndex];

            // ★修正: 保存処理のために、現在の編集ファイルをグローバル変数にセットする
            currentEditorFile = file;

            if (file.type !== 'pdf') {
                alert("編集モードはPDFのみ対応しています。");
                return;
            }

            // ページマップに追加する処理（新規関数）
            await addPagesToEditor(newFileIndex);
        } else {
            renderGrid();
        }
    }

    async function addPagesToEditor(fileIndex) {
        const file = loadedFiles[fileIndex];
        const doc = file.pdfJsDoc;

        for (let i = 0; i < doc.numPages; i++) {
            editorPageMap.push({
                fileIndex: fileIndex,
                pageIndex: i, // PDF内のページ番号(0始まり)
                pdfJsDoc: doc
            });
        }

        // 初回ロード時のみエディタ初期化
        if (!fabricCanvas) {
            initializeEditor();
            await loadEditorPage(0);
        } else {
            // 追加ロード時
            renderEditorSidebar(); // サイドバー更新

            // ★以下を追加：ページインジケータとボタン状態の更新
            const totalPages = editorPageMap.length;

            // 表示の更新 (例: "Page 1 / 4")
            if (pageIndicator) {
                pageIndicator.textContent = `Page ${currentEditorPageIndex + 1} / ${totalPages}`;
            }

            // 「次へ」ボタンのロック解除判定
            // 現在のページが最終ページでなければ、次へボタンを有効化する
            const btnNext = document.getElementById('btn-next-page');
            if (btnNext) {
                if (currentEditorPageIndex < totalPages - 1) {
                    btnNext.disabled = false;
                } else {
                    btnNext.disabled = true;
                }
            }
        }
    }

    async function processFile(file) {
        const arrayBuffer = await file.arrayBuffer();
        const fileId = loadedFiles.length;

        if (file.type.startsWith('image/')) {
            // Image handling
            loadedFiles.push({
                name: file.name,
                data: arrayBuffer,
                type: 'image',
                mime: file.type
            });

            // Calculate simple thumbnail for image
            const blob = new Blob([arrayBuffer]);
            const url = URL.createObjectURL(blob);

            allPages.push({
                fileId: fileId,
                pageIndex: 0,
                thumbnail: url,
                fileName: file.name,
                selected: false,
                rotation: 0
            });

        } else {
            // PDF handling
            const pdfDoc = await PDFLib.PDFDocument.load(arrayBuffer);
            const pdfJsDoc = await pdfjsLib.getDocument(arrayBuffer).promise;

            loadedFiles.push({
                name: file.name,
                data: arrayBuffer,
                pdfDoc: pdfDoc,
                pdfJsDoc: pdfJsDoc,
                type: 'pdf'
            });

            // Generate thumbnails
            for (let i = 0; i < pdfJsDoc.numPages; i++) {
                const page = await pdfJsDoc.getPage(i + 1);
                const viewport = page.getViewport({ scale: 0.2 });

                const canvas = document.createElement('canvas');
                const context = canvas.getContext('2d');
                canvas.height = viewport.height;
                canvas.width = viewport.width;

                await page.render({ canvasContext: context, viewport: viewport }).promise;

                allPages.push({
                    fileId: fileId,
                    pageIndex: i,
                    thumbnail: canvas.toDataURL(),
                    fileName: file.name,
                    selected: false,
                    rotation: 0
                });
            }
        }
    }

    // --- Zoom Modal Elements ---
    const zoomModal = document.getElementById('zoom-modal');
    const zoomCanvas = document.getElementById('zoom-canvas');
    const closeModal = document.getElementById('close-modal');

    closeModal.addEventListener('click', () => {
        zoomModal.classList.add('hidden');
    });

    zoomModal.addEventListener('click', (e) => {
        if (e.target === zoomModal) {
            zoomModal.classList.add('hidden');
        }
    });

    function renderGrid() {
        previewArea.innerHTML = '';

        allPages.forEach((page, index) => {
            const card = document.createElement('div');
            card.className = 'page-card';
            if (page.selected) card.classList.add('selected');

            card.draggable = true;
            card.dataset.index = index;

            // Zoom Button
            const zoomBtn = document.createElement('button');
            zoomBtn.className = 'btn-zoom';
            zoomBtn.innerHTML = '<i class="material-icons">zoom_in</i>';
            zoomBtn.title = '拡大プレビュー';
            zoomBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                showZoomModal(page);
            });
            card.appendChild(zoomBtn);

            // Rotate Button
            if (currentMode === 'reorder' || currentMode === 'img2pdf' || currentMode === 'merge' || currentMode === 'split') {
                const rotateBtn = document.createElement('button');
                rotateBtn.className = 'btn-rotate';
                rotateBtn.innerHTML = '<i class="material-icons">rotate_right</i>';
                rotateBtn.title = '回転';
                rotateBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    page.rotation = (page.rotation + 90) % 360;
                    renderGrid(); // Re-render to update transform
                });
                card.appendChild(rotateBtn);
            }

            // Selection Event
            card.addEventListener('click', (e) => {
                page.selected = !page.selected;
                renderGrid();
            });

            // Make the card draggable
            card.addEventListener('dragstart', handleDragStart);
            card.addEventListener('dragover', handleDragOver);
            card.addEventListener('dragleave', _handleDragLeave);
            card.addEventListener('drop', handleDrop);
            card.addEventListener('dragend', handleDragEnd);

            // Thumbnail Image
            const img = document.createElement('img');
            img.src = page.thumbnail;

            // Apply rotation
            if (page.rotation !== 0) {
                img.style.transform = `rotate(${page.rotation}deg)`;
            }

            card.appendChild(img);

            // Info
            const info = document.createElement('div');
            info.className = 'page-info';
            info.innerHTML = `<span>P.${page.pageIndex + 1}</span> <small>${page.fileName}</small>`;
            card.appendChild(info);

            previewArea.appendChild(card);
        });
    }

    async function showZoomModal(pageInfo) {
        zoomModal.classList.remove('hidden');

        const context = zoomCanvas.getContext('2d');
        context.clearRect(0, 0, zoomCanvas.width, zoomCanvas.height);

        const sourceFile = loadedFiles[pageInfo.fileId];

        if (sourceFile.type === 'image') {
            // Render Image
            const img = new Image();
            img.onload = () => {
                zoomCanvas.width = img.width;
                zoomCanvas.height = img.height;
                context.drawImage(img, 0, 0);
            };
            const blob = new Blob([sourceFile.data], { type: sourceFile.mime });
            img.src = URL.createObjectURL(blob);

        } else {
            // Render PDF Page
            const pdfJsDoc = sourceFile.pdfJsDoc;
            const page = await pdfJsDoc.getPage(pageInfo.pageIndex + 1);
            const viewport = page.getViewport({ scale: 1.5, rotation: pageInfo.rotation });

            zoomCanvas.height = viewport.height;
            zoomCanvas.width = viewport.width;

            await page.render({ canvasContext: context, viewport: viewport }).promise;
        }
    }

    // --- Drag & Drop Reordering Logic ---
    let draggedItem = null;

    function handleDragStart(e) {
        draggedItem = this;
        e.dataTransfer.effectAllowed = 'move';
        this.classList.add('dragging');
    }

    function handleDragOver(e) {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        if (this === draggedItem) return;

        const rect = this.getBoundingClientRect();
        const midX = rect.left + rect.width / 2;

        this.classList.remove('drop-left', 'drop-right');
        if (e.clientX < midX) {
            this.classList.add('drop-left');
        } else {
            this.classList.add('drop-right');
        }
    }

    function _handleDragLeave(e) {
        this.classList.remove('drop-left', 'drop-right');
    }

    function handleDrop(e) {
        e.stopPropagation();
        this.classList.remove('drop-left', 'drop-right');

        if (draggedItem !== this) {
            const srcIdx = parseInt(draggedItem.dataset.index);
            let dstIdx = parseInt(this.dataset.index);
            const rect = this.getBoundingClientRect();
            const midX = rect.left + rect.width / 2;

            if (e.clientX >= midX) {
                dstIdx++;
            }
            if (dstIdx > srcIdx) {
                dstIdx--;
            }

            const item = allPages.splice(srcIdx, 1)[0];
            allPages.splice(dstIdx, 0, item);
            renderGrid();
        }
        return false;
    }

    function handleDragEnd(e) {
        this.classList.remove('dragging');
        document.querySelectorAll('.page-card').forEach(card => {
            card.classList.remove('drop-left', 'drop-right');
        });
    }

    // --- Clear Button ---
    btnClear.addEventListener('click', () => {
        if (confirm('全てのデータを削除しますか？')) {
            resetApp();
        }
    });

    // --- Save Functions ---
    async function savePDF(pagesToSave, defaultName, password = null) {
        try {
            const mergedPdf = await PDFLib.PDFDocument.create();

            for (const pageInfo of pagesToSave) {
                const sourceFile = loadedFiles[pageInfo.fileId];
                const sourcePdfDoc = sourceFile.pdfDoc;
                const [copiedPage] = await mergedPdf.copyPages(sourcePdfDoc, [pageInfo.pageIndex]);

                const currentRotation = copiedPage.getRotation().angle;
                copiedPage.setRotation(PDFLib.degrees(currentRotation + pageInfo.rotation));
                mergedPdf.addPage(copiedPage);
            }

            const pdfBytes = await mergedPdf.save({ useObjectStreams: false });
            let finalBytes = pdfBytes;

            if (password) {
                if (!window.crypto || !window.crypto.subtle) {
                    alert("【セキュリティ警告】\nブラウザの制限により、この環境(非HTTPS/file://)では暗号化が機能しません。\nパスワード無しで保存します。");
                } else {
                    try {
                        const { encryptPDF } = await import('https://esm.sh/@pdfsmaller/pdf-encrypt-lite@1.0.1');
                        finalBytes = await encryptPDF(pdfBytes, password, password);
                    } catch (encErr) {
                        console.error("Encryption failed:", encErr);
                        const proceed = confirm(`暗号化に失敗しました: ${encErr.message}\n\nパスワード無しで保存しますか？`);
                        if (!proceed) return;
                    }
                }
            }
            downloadFile(finalBytes, defaultName);
        } catch (err) {
            console.error("Error saving PDF:", err);
            alert("PDFの保存に失敗しました。詳細: " + err.message);
        }
    }

    async function saveImageToPDF(pagesToSave, defaultName) {
        try {
            const newPdf = await PDFLib.PDFDocument.create();

            for (const pageInfo of pagesToSave) {
                const sourceFile = loadedFiles[pageInfo.fileId];
                let image;
                if (sourceFile.mime === 'image/jpeg') {
                    image = await newPdf.embedJpg(sourceFile.data);
                } else if (sourceFile.mime === 'image/png') {
                    image = await newPdf.embedPng(sourceFile.data);
                }
                const { width, height } = image.scale(1);
                const page = newPdf.addPage([width, height]);
                page.drawImage(image, {
                    x: 0, y: 0, width: width, height: height,
                    rotate: PDFLib.degrees(pageInfo.rotation)
                });
                page.setRotation(PDFLib.degrees(pageInfo.rotation));
            }
            const pdfBytes = await newPdf.save();
            downloadFile(pdfBytes, defaultName);
        } catch (err) {
            console.error("Error creating PDF from images:", err);
            alert("PDF作成に失敗しました。");
        }
    }

    async function savePDFToImages(pagesToSave, defaultName) {
        try {
            const zip = new JSZip();
            for (let i = 0; i < pagesToSave.length; i++) {
                const pageInfo = pagesToSave[i];
                const sourceFile = loadedFiles[pageInfo.fileId];
                const pdfJsDoc = sourceFile.pdfJsDoc;
                const page = await pdfJsDoc.getPage(pageInfo.pageIndex + 1);
                const viewport = page.getViewport({ scale: 2.0, rotation: pageInfo.rotation });
                const canvas = document.createElement('canvas');
                const context = canvas.getContext('2d');
                canvas.width = viewport.width;
                canvas.height = viewport.height;
                await page.render({ canvasContext: context, viewport: viewport }).promise;
                const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.9));
                const filename = `image_${String(i + 1).padStart(3, '0')}.jpg`;
                zip.file(filename, blob, { date: new Date() });
            }
            const content = await zip.generateAsync({ type: "blob" });
            const url = URL.createObjectURL(content);
            const a = document.createElement('a');
            a.href = url;
            a.download = defaultName;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
        } catch (err) {
            console.error("Error saving images:", err);
            alert("画像の保存に失敗しました。");
        }
    }

    async function savePDFToImagesIndividually(pagesToSave) {
        try {
            let count = 0;
            for (let i = 0; i < pagesToSave.length; i++) {
                const pageInfo = pagesToSave[i];
                const sourceFile = loadedFiles[pageInfo.fileId];
                const pdfJsDoc = sourceFile.pdfJsDoc;
                const page = await pdfJsDoc.getPage(pageInfo.pageIndex + 1);
                const viewport = page.getViewport({ scale: 2.0, rotation: pageInfo.rotation });
                const canvas = document.createElement('canvas');
                const context = canvas.getContext('2d');
                canvas.width = viewport.width;
                canvas.height = viewport.height;
                await page.render({ canvasContext: context, viewport: viewport }).promise;
                const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.9));
                const safeName = pageInfo.fileName.replace(/\.pdf$/i, "").replace(/[\\/:*?"<>|]/g, "_");
                const filename = `${safeName}_p${pageInfo.pageIndex + 1}.jpg`;
                setTimeout(() => {
                    downloadFile(blob, filename);
                }, count * 300);
                count++;
            }
        } catch (err) {
            console.error("Error saving images:", err);
            alert("画像の保存に失敗しました。");
        }
    }

    function downloadFile(data, filename) {
        const blob = new Blob([data], { type: 'application/pdf' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }

    // --- Editor Logic (Integrated) ---

    // --- Undo/Redo Logic ---
    // (Variables moved to top)


    function saveHistory() {
        if (isHistoryLocked) return;

        // Redo用に未来の履歴があれば削除
        if (historyIndex < historyStack.length - 1) {
            historyStack = historyStack.slice(0, historyIndex + 1);
        }

        // ★修正点: boxHeight, boxBorderWidth, boxBorderColor を保存対象に追加
        const json = fabricCanvas.toJSON(['id', 'selectable', 'boxHeight', 'boxBorderWidth', 'boxBorderColor']);
        delete json.backgroundImage; // 背景は除外して軽量化

        historyStack.push(json);
        historyIndex++;
        updateHistoryButtons();
    }

    function undo() {
        if (historyIndex > 0) {
            historyIndex--;
            restoreHistory(historyStack[historyIndex]);
        }
    }

    function redo() {
        if (historyIndex < historyStack.length - 1) {
            historyIndex++;
            restoreHistory(historyStack[historyIndex]);
        }
    }

    function restoreHistory(json) {
        isHistoryLocked = true; // 復元中のイベント発火による保存を防ぐ
        const currentBg = fabricCanvas.backgroundImage; // 背景画像を退避

        fabricCanvas.loadFromJSON(json, () => {
            // 背景画像を再適用
            if (currentBg) {
                fabricCanvas.setBackgroundImage(currentBg, fabricCanvas.renderAll.bind(fabricCanvas));
            }
            isHistoryLocked = false;
            updateHistoryButtons();
        });
    }

    function updateHistoryButtons() {
        btnUndo.disabled = historyIndex <= 0;
        btnRedo.disabled = historyIndex >= historyStack.length - 1;
    }

    btnUndo.addEventListener('click', undo);
    btnRedo.addEventListener('click', redo);

    const canvasContainer = document.getElementById('canvas-container');
    const editorSidebar = document.getElementById('editor-sidebar');

    // サイドバーの描画（修正版：editorPageMapを使用）
    async function renderEditorSidebar() {
        if (!editorSidebar) return;
        editorSidebar.innerHTML = '';

        // ★ editorPageMap でループ (これが重要)
        for (let i = 0; i < editorPageMap.length; i++) {
            const pageInfo = editorPageMap[i];

            const itemDiv = document.createElement('div');
            itemDiv.className = 'sidebar-page-item';
            itemDiv.dataset.pageIndex = i;
            if (i === currentEditorPageIndex) itemDiv.classList.add('active');
            itemDiv.style.position = 'relative'; // 削除ボタン配置用
            itemDiv.style.cursor = 'pointer';
            itemDiv.style.textAlign = 'center';

            // ページ番号
            const numSpan = document.createElement('div');
            numSpan.textContent = `Page ${i + 1}`;
            numSpan.style.fontSize = '0.8rem';
            numSpan.style.marginBottom = '4px';
            itemDiv.appendChild(numSpan);

            // サムネイル生成
            const page = await pageInfo.pdfJsDoc.getPage(pageInfo.pageIndex + 1);
            const viewport = page.getViewport({ scale: 0.2 });
            const canvas = document.createElement('canvas');
            canvas.height = viewport.height;
            canvas.width = viewport.width;
            await page.render({ canvasContext: canvas.getContext('2d'), viewport: viewport }).promise;

            const img = document.createElement('img');
            img.src = canvas.toDataURL();
            img.style.maxWidth = '100%';
            img.style.border = '1px solid #ddd';
            itemDiv.appendChild(img);

            // ★削除ボタンの追加
            const btnDelete = document.createElement('button');
            btnDelete.innerHTML = '<i class="material-icons" style="font-size: 16px;">close</i>';
            btnDelete.style.position = 'absolute';
            btnDelete.style.top = '2px';
            btnDelete.style.right = '2px';
            btnDelete.style.background = 'rgba(255, 0, 0, 0.8)';
            btnDelete.style.color = 'white';
            btnDelete.style.border = 'none';
            btnDelete.style.borderRadius = '50%';
            btnDelete.style.width = '20px';
            btnDelete.style.height = '20px';
            btnDelete.style.cursor = 'pointer';
            btnDelete.style.display = 'flex';
            btnDelete.style.alignItems = 'center';
            btnDelete.style.justifyContent = 'center';
            btnDelete.title = 'このページを削除';

            btnDelete.addEventListener('click', (e) => {
                e.stopPropagation();
                if (confirm('このページを削除しますか？')) {
                    deleteEditorPage(i);
                }
            });
            itemDiv.appendChild(btnDelete);

            // クリックイベント
            itemDiv.addEventListener('click', () => {
                if (currentEditorPageIndex !== i) loadEditorPage(i);
            });

            editorSidebar.appendChild(itemDiv);
        }
    }

    // ページ削除処理
    function deleteEditorPage(index) {
        editorPageMap.splice(index, 1);
        editorPages.splice(index, 1); // 編集データも削除

        if (editorPageMap.length === 0) {
            alert("全てのページが削除されました。初期画面に戻ります。");
            resetApp();
            return;
        }

        if (currentEditorPageIndex >= editorPageMap.length) {
            currentEditorPageIndex = editorPageMap.length - 1;
        }

        renderEditorSidebar();
        loadEditorPage(currentEditorPageIndex);
    }

    function hexToRgb(hex) {
        const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
        return result ? PDFLib.rgb(
            parseInt(result[1], 16) / 255,
            parseInt(result[2], 16) / 255,
            parseInt(result[3], 16) / 255
        ) : undefined;
    }

    // ページ切り替え時にサイドバーの選択状態を更新
    function updateSidebarSelection(index) {
        if (!editorSidebar) return;
        const items = editorSidebar.querySelectorAll('.sidebar-page-item');
        items.forEach(item => {
            if (parseInt(item.dataset.pageIndex) === index) {
                item.classList.add('active');

                // scrollIntoView は画面全体を動かす可能性があるため、
                // offsetTop を使ってサイドバー内部のスクロール位置だけを計算して動かす
                const sidebarHeight = editorSidebar.clientHeight;
                const itemTop = item.offsetTop;
                const itemHeight = item.clientHeight;

                // 選択したアイテムがサイドバーの中央に来るように計算
                const targetScrollTop = itemTop - (sidebarHeight / 2) + (itemHeight / 2);

                editorSidebar.scrollTo({
                    top: targetScrollTop,
                    behavior: 'smooth'
                });

            } else {
                item.classList.remove('active');
            }
        });
    }

    // 1. Tool Selection Handlers

    // テキスト追加ボタン (onclickで強制上書きして確実に動作させる)
    const activeBtnAddText = document.getElementById('btn-add-text');
    if (activeBtnAddText) {
        activeBtnAddText.onclick = (e) => {
            e.preventDefault(); // フォーカス移動などを防ぐ

            currentEditorTool = 'text';
            if (fabricCanvas) {
                fabricCanvas.defaultCursor = 'text';
                fabricCanvas.discardActiveObject();
                fabricCanvas.renderAll();
            }

            // UI更新
            resetToolButtons();
            activeBtnAddText.classList.remove('is-outlined');
            activeBtnAddText.classList.add('is-primary');
        };
    }

    // 2. Canvas Initialization & Event Handlers
    function initializeEditor() {
        if (!fabricCanvas) {
            fabricCanvas = new fabric.Canvas('fabric-canvas');




            fabricCanvas.on('selection:created', onSelectionChanged);
            fabricCanvas.on('selection:updated', onSelectionChanged);
            fabricCanvas.on('selection:cleared', onSelectionCleared);

            fabricCanvas.on('object:modified', saveHistory);
            fabricCanvas.on('object:added', saveHistory);
            fabricCanvas.on('object:removed', saveHistory);

            fabricCanvas.on('object:moving', updateToolbarPosition);
            fabricCanvas.on('object:scaling', updateToolbarPosition);
            fabricCanvas.on('object:resizing', updateToolbarPosition);

            // ★重要: スケーリング時の高さ調整ロジック
            // ★修正: テキストボックスのスケーリング（位置ズレ防止・はみ出し防止版）
            // ★修正: テキストボックスのスケーリング（縮小可能・位置ズレ防止版）
            fabricCanvas.on('object:scaling', (e) => {
                const obj = e.target;
                if (obj.type === 'textbox') {
                    const corner = e.transform.corner;

                    const scaledWidth = obj.width * obj.scaleX;
                    const scaledHeight = obj.height * obj.scaleY;

                    // ★修正: リサイズ中は「現在の枠の高さ」に縛られないように一時的に0にする
                    // これにより、純粋な「テキストの高さ」だけを最小値として取得できる
                    const savedBoxHeight = obj.boxHeight;
                    obj.boxHeight = 0;
                    const minHeight = obj.calcTextHeight();
                    obj.boxHeight = savedBoxHeight; // 計算が終わったら念のため戻す

                    const newWidth = Math.max(scaledWidth, 20);
                    // 最小値(minHeight)は「中の文字の高さ」になるため、それ以上であれば自由に縮小可能になる
                    const newHeight = Math.max(scaledHeight, minHeight);

                    // 位置ズレ防止のアンカー決定
                    const anchorY = (['mt', 'tr', 'tl'].includes(corner)) ? 'bottom' : 'top';
                    const anchorPoint = obj.getPointByOrigin('left', anchorY);

                    obj.set({
                        width: newWidth,
                        height: newHeight,
                        boxHeight: newHeight, // 新しい高さを確定
                        scaleX: 1,
                        scaleY: 1
                    });

                    obj.setPositionByOrigin(anchorPoint, 'left', anchorY);
                }
            });


            // Bounds restriction
            fabricCanvas.on('object:moving', (e) => {
                const obj = e.target;
                const canvas = obj.canvas;
                const objWidth = obj.getScaledWidth();
                const objHeight = obj.getScaledHeight();

                if (obj.left < 0) obj.left = 0;
                if (obj.top < 0) obj.top = 0;
                if (obj.left + objWidth > canvas.width) obj.left = canvas.width - objWidth;
                if (obj.top + objHeight > canvas.height) obj.top = canvas.height - objHeight;
            });

            fabricCanvas.on('mouse:down', onMouseDown);
            fabricCanvas.on('mouse:move', onMouseMove);
            fabricCanvas.on('mouse:up', onMouseUp);

            renderEditorSidebar();
        }
    }

    // Mouse Interaction for Drawing
    function onMouseDown(o) {
        if (currentEditorTool === 'select') return;
        isDrawing = true;
        const pointer = fabricCanvas.getPointer(o.e);
        startX = pointer.x;
        startY = pointer.y;

        const commonProps = { left: startX, top: startY, fill: 'transparent', stroke: '#000000', strokeWidth: 3, strokeUniform: true };

        if (currentEditorTool === 'text') {
            drawingObject = new fabric.Rect({
                left: startX, top: startY, width: 0, height: 0,
                fill: 'rgba(0, 150, 136, 0.2)', stroke: '#009688', strokeWidth: 1, strokeDashArray: [5, 5]
            });
        } else if (currentEditorTool === 'rect') {
            drawingObject = new fabric.Rect({ ...commonProps, width: 0, height: 0 });
        } else if (currentEditorTool === 'circle') {
            drawingObject = new fabric.Ellipse({ ...commonProps, rx: 0, ry: 0 });
        } else if (currentEditorTool === 'triangle') {
            drawingObject = new fabric.Triangle({ ...commonProps, width: 0, height: 0 });
        }

        if (drawingObject) fabricCanvas.add(drawingObject);
    }

    function onMouseMove(o) {
        if (!isDrawing || !drawingObject) return;
        const pointer = fabricCanvas.getPointer(o.e);
        const w = Math.abs(pointer.x - startX);
        const h = Math.abs(pointer.y - startY);
        const l = pointer.x < startX ? pointer.x : startX;
        const t = pointer.y < startY ? pointer.y : startY;

        if (currentEditorTool === 'text') {
            drawingObject.set({ width: Math.max(w, 20), height: Math.max(h, 20) }); // 高さも更新
        } else if (currentEditorTool === 'rect' || currentEditorTool === 'triangle') {
            drawingObject.set({ left: l, top: t, width: w, height: h });
        } else if (currentEditorTool === 'circle') {
            drawingObject.set({ left: l, top: t, rx: w / 2, ry: h / 2 });
        }
        fabricCanvas.renderAll();
    }

    function onMouseUp(o) {
        if (!isDrawing) return;
        isDrawing = false;
        if (drawingObject) drawingObject.setCoords();

        if (currentEditorTool === 'text' && drawingObject) {
            fabricCanvas.remove(drawingObject);
            // テキストボックス生成
            // ★ boxHeight をドラッグした高さに設定し、上下のリサイズハンドルを有効化
            const text = new fabric.Textbox('ここに入力', {
                left: drawingObject.left, top: drawingObject.top,
                width: drawingObject.width > 20 ? drawingObject.width : 150,
                boxHeight: drawingObject.height > 20 ? drawingObject.height : 50, // 初期の高さを設定
                fontFamily: 'Noto Sans JP',
                fontSize: 24,
                fill: '#000000',
                backgroundColor: 'transparent',
                boxBorderWidth: 0,
                boxBorderColor: '#000000',
                lockScalingY: false // 縦方向のリサイズを許可
            });

            // 縦方向のリサイズハンドルを明示的に有効化
            text.setControlsVisibility({
                mt: true,
                mb: true,
                ml: true,
                mr: true
            });

            fabricCanvas.add(text);
            fabricCanvas.setActiveObject(text);
        } else if (['rect', 'circle', 'triangle'].includes(currentEditorTool)) {
            if (drawingObject.width < 5 || drawingObject.height < 5) {
                fabricCanvas.remove(drawingObject);
            } else {
                fabricCanvas.setActiveObject(drawingObject);
            }
        }

        saveHistory();
        currentEditorTool = 'select';
        fabricCanvas.defaultCursor = 'default';
        drawingObject = null;
        resetToolButtons();
    }

    // --- Zoom & Pagination Logic ---

    // ズーム表示更新関数
    function updateZoomDisplay() {
        if (!zoomLevelText || !canvasWrapper) return;

        // 浮動小数点の誤差対策
        currentZoomScale = Math.round(currentZoomScale * 1000) / 1000;

        // テキスト更新
        zoomLevelText.textContent = `${Math.round(currentZoomScale * 100)}%`;

        // スタイル適用
        canvasWrapper.style.transformOrigin = 'top center';
        canvasWrapper.style.transform = `scale(${currentZoomScale})`;

        // 拡大時の余白調整（画面からはみ出さないように）
        if (currentZoomScale > 1) {
            const margin = (currentZoomScale - 1) * 300;
            canvasWrapper.style.marginTop = `${margin}px`;
            canvasWrapper.style.marginBottom = `${margin}px`;
        } else {
            canvasWrapper.style.marginTop = '0';
            canvasWrapper.style.marginBottom = '0';
        }
    }

    // ズームインボタン (5%刻み)
    if (btnZoomIn) {
        btnZoomIn.addEventListener('click', () => {
            if (currentZoomScale < 3.0) {
                currentZoomScale += 0.05;
                updateZoomDisplay();
            }
        });
    }

    // ズームアウトボタン (5%刻み)
    if (btnZoomOut) {
        btnZoomOut.addEventListener('click', () => {
            if (currentZoomScale > 0.3) {
                currentZoomScale -= 0.05;
                updateZoomDisplay();
            }
        });
    }

    // 前へボタン
    if (btnPrevPage) {
        btnPrevPage.addEventListener('click', () => {
            if (currentEditorPageIndex > 0) {
                loadEditorPage(currentEditorPageIndex - 1);
            }
        });
    }

    // 次へボタン
    if (btnNextPage) {
        btnNextPage.addEventListener('click', () => {
            // editorPageMapが存在しない場合のフォールバックも含める
            const maxPage = (typeof editorPageMap !== 'undefined' && editorPageMap.length > 0)
                ? editorPageMap.length
                : (currentEditorPdfJsDoc ? currentEditorPdfJsDoc.numPages : 1);

            if (currentEditorPageIndex < maxPage - 1) {
                loadEditorPage(currentEditorPageIndex + 1);
            }
        });
    }

    // --- Toolbar Interaction Logic ---

    // Global click listener to close popups if clicked outside
    document.addEventListener('click', (e) => {
        if (popupTextColor && !e.target.closest('#btn-text-color-trigger') && !e.target.closest('#popup-text-color')) {
            popupTextColor.classList.add('hidden');
        }
        if (popupBgColor && !e.target.closest('#btn-bg-color-trigger') && !e.target.closest('#popup-bg-color')) {
            popupBgColor.classList.add('hidden');
        }
    });

    function onSelectionChanged(e) {
        const activeObj = e.selected ? e.selected[0] : fabricCanvas.getActiveObject();
        if (activeObj) {
            showFloatingToolbar(activeObj);
        } else {
            hideFloatingToolbar();
        }
    }

    function onSelectionCleared() {
        hideFloatingToolbar();
    }

    function onObjectModified(e) {
        const obj = e.target;
        if (obj && (obj.type === 'textbox' || obj.type === 'i-text')) {
            if (floatFontSize) {
                floatFontSize.value = Math.round(obj.fontSize * obj.scaleX);
            }
        } else if (obj && ['rect', 'circle', 'triangle'].includes(obj.type)) {
            if (floatStrokeWidth) {
                floatStrokeWidth.value = obj.strokeWidth;
            }
        }
    }
    function showFloatingToolbar(obj) {
        if (!obj) return;
        floatingToolbar.classList.remove('hidden');

        // テキストか図形かで表示切り替え
        const isText = (obj.type === 'textbox' || obj.type === 'i-text');

        // ★追加: 枠線色ラッパー要素の取得
        const wrapperBorderColor = document.getElementById('wrapper-border-color');

        if (isText) {
            if (toolbarTextTools) toolbarTextTools.style.display = 'flex';
            // ★追加: テキストでも枠線色アイコンを表示する
            if (wrapperBorderColor) wrapperBorderColor.style.display = 'flex';
        } else {
            // 図形の場合
            if (toolbarTextTools) toolbarTextTools.style.display = 'none';
            if (wrapperBorderColor) wrapperBorderColor.style.display = 'none';
        }

        // 共通: 太さ (Stroke Width / Box Border Width)
        if (floatStrokeWidth && floatStrokeWidth.parentElement) {
            floatStrokeWidth.parentElement.style.display = 'flex';
            floatStrokeWidth.parentElement.style.alignItems = 'center';

            const currentVal = isText ? (obj.boxBorderWidth || 0) : (obj.strokeWidth || 0);
            floatStrokeWidth.value = currentVal;
        }

        // --- Sync Values ---
        // Font Size (Text Only)
        if (isText) {
            if (floatFontSize && floatFontSize.parentElement) {
                floatFontSize.parentElement.style.display = 'flex';
                floatFontSize.value = Math.round(obj.fontSize * obj.scaleX);
            }

            if (floatTextColor) {
                const textColor = obj.fill || '#000000';
                floatTextColor.value = typeof textColor === 'string' ? textColor : '#000000';
                if (indicatorTextColor) indicatorTextColor.style.backgroundColor = floatTextColor.value;
                if (btnTextColorTrigger) btnTextColorTrigger.parentElement.title = "文字色";
            }
            // Formatting
            if (btnBold) {
                btnBold.classList.toggle('active', obj.fontWeight === 'bold');
                btnBold.style.display = 'flex';
            }
            if (btnItalic) {
                btnItalic.classList.toggle('active', obj.fontStyle === 'italic');
                btnItalic.style.display = 'flex';
            }
            if (btnUnderline) {
                btnUnderline.classList.toggle('active', !!obj.underline);
                btnUnderline.style.display = 'flex';
            }
            // Alignment
            if (btnAlignLeft) {
                btnAlignLeft.classList.toggle('active', obj.textAlign === 'left');
                btnAlignLeft.parentElement.style.display = 'flex';
            }
            if (btnAlignCenter) btnAlignCenter.classList.toggle('active', obj.textAlign === 'center');
            if (btnAlignRight) btnAlignRight.classList.toggle('active', obj.textAlign === 'right');

            // ★追加: 垂直揃えボタンの状態更新
            const currentValign = obj.verticalAlign || 'top';
            updateVerticalAlignUI(currentValign);
            // 垂直揃えボタンの表示制御
            if (btnValignTop && btnValignTop.parentElement) {
                btnValignTop.parentElement.style.display = 'flex';
            }

        } else {
            // Shape
            if (floatFontSize && floatFontSize.parentElement) floatFontSize.parentElement.style.display = 'none';
            if (btnBold) btnBold.style.display = 'none';
            if (btnItalic) btnItalic.style.display = 'none';
            if (btnUnderline) btnUnderline.style.display = 'none';
            if (btnAlignLeft && btnAlignLeft.parentElement) btnAlignLeft.parentElement.style.display = 'none';
            // ★追加
            if (btnValignTop && btnValignTop.parentElement) btnValignTop.parentElement.style.display = 'none';

            if (floatTextColor) {
                const stroke = obj.stroke || '#000000';
                floatTextColor.value = stroke;
                if (indicatorTextColor) indicatorTextColor.style.backgroundColor = stroke;
                if (btnTextColorTrigger) btnTextColorTrigger.parentElement.title = "枠線の色";
            }
        }

        // Common Color Logic (Background/Fill)
        const bgColor = isText ? (obj.backgroundColor || 'transparent') : (obj.fill || 'transparent');

        if (!bgColor || bgColor === 'transparent') {
            if (floatBgColor) floatBgColor.value = '#ffffff'; // Default
            if (bgOpacity) bgOpacity.value = 0;
            if (indicatorBgColor) {
                indicatorBgColor.style.backgroundColor = 'transparent';
                indicatorBgColor.style.backgroundImage = 'url(\'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAQAAAAECAYAAACp8Z5+AAAAIklEQVQIW2NkQAKrVq36zwjjgzjwqUAXYwYyeLIItYMNKBkAjxsI8j+dUwAAAABJRU5ErkJggg==\')'; // Checker
            }
        } else {
            // Parse RGBA or Hex
            if (bgColor.startsWith('rgba')) {
                // Extract alpha
                const match = bgColor.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)/);
                if (match) {
                    const r = parseInt(match[1]);
                    const g = parseInt(match[2]);
                    const b = parseInt(match[3]);
                    const a = match[4] !== undefined ? parseFloat(match[4]) : 1;

                    if (floatBgColor) floatBgColor.value = rgbToHex(r, g, b);
                    if (bgOpacity) bgOpacity.value = a;
                    if (indicatorBgColor) {
                        indicatorBgColor.style.backgroundColor = bgColor;
                        indicatorBgColor.style.backgroundImage = 'none';
                    }
                }
            } else {
                // Hex or Name
                if (floatBgColor) floatBgColor.value = bgColor; // Assuming Hex for simplicity
                if (bgOpacity) bgOpacity.value = 1;
                if (indicatorBgColor) {
                    indicatorBgColor.style.backgroundColor = bgColor;
                    indicatorBgColor.style.backgroundImage = 'none';
                }
            }
        }

        if (btnBgColorTrigger) btnBgColorTrigger.parentElement.title = isText ? "背景色" : "塗りつぶし色";

        // Show Color controls
        if (btnTextColorTrigger && btnTextColorTrigger.parentElement) btnTextColorTrigger.parentElement.style.display = 'flex';
        if (btnBgColorTrigger && btnBgColorTrigger.parentElement) btnBgColorTrigger.parentElement.style.display = 'flex';

        updateToolbarPosition();
    }

    function hideFloatingToolbar() {
        if (floatingToolbar) floatingToolbar.classList.add('hidden');
        if (popupTextColor) popupTextColor.classList.add('hidden');
        if (popupBgColor) popupBgColor.classList.add('hidden');
    }

    function updateToolbarPosition() {
        if (floatingToolbar.classList.contains('hidden')) return;
        const activeObj = fabricCanvas.getActiveObject();
        if (!activeObj) return;

        // 1. キャンバスラッパーの画面上の位置を取得（スクロールやCSS変形を含む正確な位置）
        const wrapperRect = canvasWrapper.getBoundingClientRect();

        // 2. オブジェクトのキャンバス内座標を取得
        const bound = activeObj.getBoundingRect();

        const toolbarWidth = floatingToolbar.offsetWidth;
        const toolbarHeight = floatingToolbar.offsetHeight;
        const windowWidth = window.innerWidth;
        const windowHeight = window.innerHeight;

        // 3. 画面上の絶対座標（fixed用）を計算
        // 重要: CSSでzoomしているため、オブジェクトの座標もscale倍する必要がある
        // オブジェクトの中心X座標 = キャンバス左端 + (オブジェクト左端 * ズーム) + (オブジェクト幅 * ズーム / 2)
        let left = wrapperRect.left + (bound.left * currentZoomScale) + ((bound.width * currentZoomScale) / 2) - (toolbarWidth / 2);

        // オブジェクトの上端Y座標 = キャンバス上端 + (オブジェクト上端 * ズーム)
        // ツールバーはオブジェクトの上に表示
        let top = wrapperRect.top + (bound.top * currentZoomScale) - toolbarHeight - 10;

        // --- 画面外へのはみ出し補正 (Viewport基準) ---

        // A. 左端の補正
        if (left < 10) {
            left = 10;
        }

        // B. 右端の補正
        if (left + toolbarWidth > windowWidth - 10) {
            left = windowWidth - 10 - toolbarWidth;
        }

        // C. 上端の補正 (画面上にはみ出る場合はオブジェクトの下に出す)
        if (top < 10) {
            top = wrapperRect.top + ((bound.top + bound.height) * currentZoomScale) + 10;
        }

        // 座標を適用
        floatingToolbar.style.top = `${top}px`;
        floatingToolbar.style.left = `${left}px`;

        // ポップアップの向き自動調整
        const shouldOpenDown = top < 300;
        const popups = [popupTextColor, popupBgColor];
        if (typeof popupBorderColor !== 'undefined') popups.push(popupBorderColor);
        if (typeof popupAddShape !== 'undefined') popups.push(popupAddShape);

        popups.forEach(popup => {
            if (popup) {
                if (shouldOpenDown) {
                    popup.classList.add('opens-down');
                } else {
                    popup.classList.remove('opens-down');
                }
            }
        });
    }

    function rgbToHex(r, g, b) {
        return "#" + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1);
    }

    function hexToRgba(hex, alpha) {
        const r = parseInt(hex.slice(1, 3), 16);
        const g = parseInt(hex.slice(3, 5), 16);
        const b = parseInt(hex.slice(5, 7), 16);
        return `rgba(${r}, ${g}, ${b}, ${alpha})`;
    }

    // --- Creation Logic ---

    // --- 新しい図形メニューの制御 ---
    // Shape Menu
    document.addEventListener('click', (e) => {
        if (popupAddShape && !e.target.closest('#btn-add-shape-trigger')) {
            popupAddShape.classList.add('hidden');
        }
    });

    if (btnAddShapeTrigger) {
        btnAddShapeTrigger.addEventListener('click', (e) => {
            e.stopPropagation();
            popupAddShape.classList.toggle('hidden');
        });
    }

    function selectShapeTool(toolType) {
        currentEditorTool = toolType;
        if (fabricCanvas) {
            fabricCanvas.defaultCursor = 'crosshair';
            fabricCanvas.discardActiveObject();
            fabricCanvas.renderAll();
        }
        popupAddShape.classList.add('hidden');
        resetToolButtons();
        btnAddShapeTrigger.classList.remove('is-outlined');
        btnAddShapeTrigger.classList.add('is-primary');
    }

    if (btnShapeRect) btnShapeRect.addEventListener('click', () => selectShapeTool('rect'));
    if (btnShapeCircle) btnShapeCircle.addEventListener('click', () => selectShapeTool('circle'));
    if (btnShapeTriangle) btnShapeTriangle.addEventListener('click', () => selectShapeTool('triangle'));

    function resetToolButtons() {
        const txtBtn = document.getElementById('btn-add-text');
        if (txtBtn) { txtBtn.classList.remove('is-primary'); txtBtn.classList.add('is-outlined'); }
        if (btnAddShapeTrigger) { btnAddShapeTrigger.classList.remove('is-primary'); btnAddShapeTrigger.classList.add('is-outlined'); }
    }

    // --- UI Event Listeners ---


    // --- UI Event Listeners ---

    // --- Toolbar Interaction Handlers ---

    // Toggle Popups
    // Toggle Popups
    btnTextColorTrigger.addEventListener('click', (e) => {
        e.stopPropagation();
        popupBgColor.classList.add('hidden');
        popupTextColor.classList.toggle('hidden');
    });

    btnBgColorTrigger.addEventListener('click', (e) => {
        e.stopPropagation();
        popupTextColor.classList.add('hidden');
        popupBgColor.classList.toggle('hidden');
    });


    // Prevent popup close when clicking inside
    popupTextColor.addEventListener('click', (e) => e.stopPropagation());
    popupBgColor.addEventListener('click', (e) => e.stopPropagation());

    // Presets Logic
    const presetSwatches = document.querySelectorAll('.color-swatch');
    presetSwatches.forEach(swatch => {
        swatch.addEventListener('click', () => {
            const color = swatch.dataset.color;
            // Determine which popup is active to know if Text or Bg
            if (!popupTextColor.classList.contains('hidden')) {
                // Text Color
                updateTextColor(color);
                floatTextColor.value = color; // Sync picker if possible (might fail for transparent but text usually isn't)
            } else if (!popupBgColor.classList.contains('hidden')) {
                // Bg Color
                if (color === 'transparent') {
                    updateBgColor('transparent', 0);
                    floatBgColor.value = '#ffffff';
                    bgOpacity.value = 0;
                } else {
                    updateBgColor(color, 1);
                    floatBgColor.value = color;
                    bgOpacity.value = 1;
                }
            }
        });
    });

    // Style Toggles
    btnBold.addEventListener('click', () => toggleStyle('fontWeight', 'bold', 'normal', btnBold));
    btnItalic.addEventListener('click', () => toggleStyle('fontStyle', 'italic', 'normal', btnItalic));
    btnUnderline.addEventListener('click', () => {
        const activeObj = fabricCanvas.getActiveObject();
        if (activeObj && (activeObj.type === 'textbox' || activeObj.type === 'i-text')) {
            const newVal = !activeObj.underline;
            activeObj.set('underline', newVal);
            fabricCanvas.renderAll();
            btnUnderline.classList.toggle('active', newVal);
        }
    });

    function toggleStyle(prop, activeVal, inactiveVal, btn) {
        const activeObj = fabricCanvas.getActiveObject();
        if (activeObj && (activeObj.type === 'textbox' || activeObj.type === 'i-text')) {
            const current = activeObj[prop];
            const newVal = current === activeVal ? inactiveVal : activeVal;
            activeObj.set(prop, newVal);
            fabricCanvas.renderAll();
            btn.classList.toggle('active', newVal === activeVal);
        }
    }

    // Alignment
    btnAlignLeft.addEventListener('click', () => setAlign('left'));
    btnAlignCenter.addEventListener('click', () => setAlign('center'));
    btnAlignRight.addEventListener('click', () => setAlign('right'));

    function setAlign(align) {
        const activeObj = fabricCanvas.getActiveObject();
        if (activeObj && (activeObj.type === 'textbox' || activeObj.type === 'i-text')) {
            activeObj.set('textAlign', align);
            fabricCanvas.renderAll();
            // Update UI
            btnAlignLeft.classList.toggle('active', align === 'left');
            btnAlignCenter.classList.toggle('active', align === 'center');
            btnAlignRight.classList.toggle('active', align === 'right');
        }
    }

    // --- Vertical Alignment (垂直揃え) ---
    if (btnValignTop) btnValignTop.addEventListener('click', () => setVerticalAlign('top'));
    if (btnValignMiddle) btnValignMiddle.addEventListener('click', () => setVerticalAlign('middle'));
    if (btnValignBottom) btnValignBottom.addEventListener('click', () => setVerticalAlign('bottom'));

    function setVerticalAlign(align) {
        const activeObj = fabricCanvas.getActiveObject();
        if (activeObj && (activeObj.type === 'textbox')) {
            // プロパティをセットし、キャッシュ更新フラグを立てる
            activeObj.set({
                'verticalAlign': align,
                'dirty': true
            });
            fabricCanvas.requestRenderAll();
            saveHistory();

            // UI更新
            updateVerticalAlignUI(align);
        }
    }

    function updateVerticalAlignUI(align) {
        if (btnValignTop) btnValignTop.classList.toggle('active', align === 'top' || !align); // デフォルトtop
        if (btnValignMiddle) btnValignMiddle.classList.toggle('active', align === 'middle');
        if (btnValignBottom) btnValignBottom.classList.toggle('active', align === 'bottom');
    }

    // Font Size
    floatFontSize.addEventListener('input', (e) => {
        const val = parseInt(e.target.value, 10);
        const activeObj = fabricCanvas.getActiveObject();
        if (activeObj && (activeObj.type === 'textbox' || activeObj.type === 'i-text')) {
            activeObj.set({
                fontSize: val,
                scaleX: 1,
                scaleY: 1
            });
            fabricCanvas.renderAll();
        }
    });

    // Stroke/Border Width
    if (floatStrokeWidth) {
        floatStrokeWidth.addEventListener('input', (e) => {
            const val = parseInt(e.target.value, 10);

            // 単一選択か複数選択かに関わらず、すべての対象を取得
            const activeObjects = fabricCanvas.getActiveObjects();

            if (activeObjects.length > 0) {
                activeObjects.forEach(obj => {
                    if (obj.type === 'textbox' || obj.type === 'i-text') {
                        // テキストボックスは独自の枠線プロパティ
                        obj.set({
                            'boxBorderWidth': val,
                            'dirty': true
                        });
                    } else {
                        // 図形は標準の枠線プロパティ
                        obj.set('strokeWidth', val);
                    }
                });

                fabricCanvas.requestRenderAll();
                saveHistory(); // 履歴に保存
            }
        });
    }

    // 枠線の色変更 (テキスト用)
    if (floatBorderColor) {
        floatBorderColor.addEventListener('input', (e) => {
            const val = e.target.value;
            const activeObj = fabricCanvas.getActiveObject();
            if (activeObj && activeObj.type === 'textbox') {
                activeObj.set({
                    'boxBorderColor': val,
                    'dirty': true
                });
                indicatorBorderColor.style.backgroundColor = val;
                fabricCanvas.renderAll();
            }
        });
    }
    // 枠線色ポップアップの開閉
    if (btnBorderColorTrigger) {
        btnBorderColorTrigger.addEventListener('click', (e) => {
            e.stopPropagation();
            if (popupBorderColor) popupBorderColor.classList.toggle('hidden');
            // 他を閉じる
            if (popupTextColor) popupTextColor.classList.add('hidden');
            if (popupBgColor) popupBgColor.classList.add('hidden');
        });
    }

    // 枠線プリセット
    if (popupBorderColor) {
        const borderSwatches = popupBorderColor.querySelectorAll('.color-swatch');
        borderSwatches.forEach(swatch => {
            swatch.addEventListener('click', () => {
                const color = swatch.dataset.color;
                const activeObj = fabricCanvas.getActiveObject();
                if (activeObj && activeObj.type === 'textbox') {
                    activeObj.set({
                        'boxBorderColor': color,
                        'dirty': true
                    });
                    if (color === 'transparent') {
                        activeObj.set('boxBorderWidth', 0); // 透明なら太さ0
                        floatStrokeWidth.value = 0;
                    }
                    if (floatBorderColor) floatBorderColor.value = (color === 'transparent') ? '#000000' : color;
                    if (indicatorBorderColor) indicatorBorderColor.style.backgroundColor = color;
                    fabricCanvas.renderAll();
                }
            });
        });
    }

    // Text Color Input
    floatTextColor.addEventListener('input', (e) => {
        updateTextColor(e.target.value);
    });

    function updateTextColor(val) {
        const activeObj = fabricCanvas.getActiveObject();
        if (activeObj) {
            if (activeObj.type === 'rect' || activeObj.type === 'circle' || activeObj.type === 'triangle') {
                activeObj.set('stroke', val);
            } else {
                activeObj.set('fill', val);
            }
            indicatorTextColor.style.backgroundColor = val;
            fabricCanvas.renderAll();
        }
    }

    // Bg Color Input
    floatBgColor.addEventListener('input', (e) => {
        updateBgColor(e.target.value, parseFloat(bgOpacity.value));
    });

    // Opacity Input
    bgOpacity.addEventListener('input', (e) => {
        updateBgColor(floatBgColor.value, parseFloat(e.target.value));
    });

    function updateBgColor(hexColor, alpha) {
        const activeObj = fabricCanvas.getActiveObject();
        if (!activeObj) return;

        let finalColor;
        if (alpha === 0 || hexColor === 'transparent') {
            finalColor = 'transparent';
            indicatorBgColor.style.backgroundColor = 'transparent';
            indicatorBgColor.style.backgroundImage = 'url(\'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAQAAAAECAYAAACp8Z5+AAAAIklEQVQIW2NkQAKrVq36zwjjgzjwqUAXYwYyeLIItYMNKBkAjxsI8j+dUwAAAABJRU5ErkJggg==\')';
        } else {
            finalColor = hexToRgba(hexColor, alpha);
            indicatorBgColor.style.backgroundColor = finalColor;
            indicatorBgColor.style.backgroundImage = 'none';
        }

        if (activeObj.type === 'rect' || activeObj.type === 'circle' || activeObj.type === 'triangle') {
            activeObj.set('fill', finalColor);
        } else {
            activeObj.set('backgroundColor', finalColor);
        }
        fabricCanvas.renderAll();
    }

    if (btnDeleteObj) {
        // 1. ボタン要素を複製し、古いイベントリスナーを全て強制削除する
        const newBtn = btnDeleteObj.cloneNode(true);
        if (btnDeleteObj.parentNode) {
            btnDeleteObj.parentNode.replaceChild(newBtn, btnDeleteObj);
        }

        // 2. 新しいボタンに mousedown イベントを設定（クリック競合を回避）
        newBtn.addEventListener('mousedown', (e) => {
            // フォーカス移動とイベント伝播を確実に止める
            e.preventDefault();
            e.stopPropagation();

            if (!fabricCanvas) return;

            // 選択されている全オブジェクトを取得（単一・複数対応）
            const activeObjects = fabricCanvas.getActiveObjects();

            if (activeObjects && activeObjects.length > 0) {
                // 3. 処理前に選択状態を解除（エラー防止）
                fabricCanvas.discardActiveObject();

                // 4. オブジェクトを削除
                activeObjects.forEach((obj) => {
                    fabricCanvas.remove(obj);
                });

                // 5. 画面更新と履歴保存
                fabricCanvas.requestRenderAll();
                hideFloatingToolbar();
                saveHistory();
            }
        });
    }

    // 他のツールボタンにも同様の処置を適用
    document.querySelectorAll('#floating-toolbar .btn-tool, #floating-toolbar .btn.is-text').forEach(btn => {
        btn.addEventListener('mousedown', (e) => {
            if (e.target.tagName !== 'INPUT') {
                e.preventDefault();
            }
        });
    });

    // Sidebar Color Picker Sync removed

    // btnDeleteObj Listener removed

    async function loadEditorPage(index) {
        // 現在のページ状態を保存
        if (currentEditorPageIndex >= 0 && editorPages[currentEditorPageIndex] && fabricCanvas) {
            // ★重要: メモリ爆発を防ぐため、背景画像を一時的に退避
            const originalBg = fabricCanvas.backgroundImage;
            fabricCanvas.backgroundImage = null;

            // 背景画像抜きでJSON化
            const json = fabricCanvas.toJSON(['id', 'selectable', 'boxHeight', 'boxBorderWidth', 'boxBorderColor', 'verticalAlign']);

            // データを保存
            editorPages[currentEditorPageIndex].fabricJSON = json;

            // 背景画像を即座に戻す（ユーザーには気づかれない）
            fabricCanvas.backgroundImage = originalBg;
        }

        if (index < 0 || index >= editorPageMap.length) return;

        currentEditorPageIndex = index;
        const pageInfo = editorPageMap[index];
        const pdfJsDoc = pageInfo.pdfJsDoc;
        const page = await pdfJsDoc.getPage(pageInfo.pageIndex + 1);
        const viewport = page.getViewport({ scale: 1.5 });

        // Canvas Re-initialization
        if (fabricCanvas) {
            fabricCanvas.clear();
            fabricCanvas.setWidth(viewport.width);
            fabricCanvas.setHeight(viewport.height);
        } else {
            // Should be initialized already but just in case
            initializeEditor();
            fabricCanvas.setWidth(viewport.width);
            fabricCanvas.setHeight(viewport.height);
        }

        // Render PDF Page to Canvas Background
        const canvasEl = document.createElement('canvas');
        const context = canvasEl.getContext('2d');
        canvasEl.height = viewport.height;
        canvasEl.width = viewport.width;

        await page.render({ canvasContext: context, viewport: viewport }).promise;

        const bgImage = new fabric.Image(canvasEl, {
            left: 0,
            top: 0,
            angle: 0,
            opacity: 1,
            selectable: false,
            evented: false,
        });
        fabricCanvas.setBackgroundImage(bgImage, fabricCanvas.renderAll.bind(fabricCanvas));

        // Restore Objects
        // ページ切り替え時に、保存されたJSONがあれば復元
        if (editorPages[index] && editorPages[index].fabricJSON) {
            fabricCanvas.loadFromJSON(editorPages[index].fabricJSON, () => {
                fabricCanvas.renderAll();
                // 今回はページ遷移で履歴はリセットする仕様とする（複雑化回避）
                historyStack = [];
                historyIndex = -1;
                isHistoryLocked = false;
                if (typeof updateHistoryUI === 'function') updateHistoryUI();
            });
        } else {
            // 新規ページなので履歴リセット
            editorPages[index] = { pageIndex: index, fabricJSON: null };
            historyStack = [];
            historyIndex = -1;
            isHistoryLocked = false;
            if (typeof updateHistoryUI === 'function') updateHistoryUI();
        }

        // ページインジケータ更新
        if (pageIndicator) { // null check
            pageIndicator.textContent = `Page ${index + 1} / ${editorPageMap.length}`;
        }
        if (btnPrevPage) btnPrevPage.disabled = index === 0;
        if (btnNextPage) btnNextPage.disabled = index === editorPageMap.length - 1;

        // サイドバーの選択状態更新
        updateSidebarSelection(index);
    }

    btnPrevPage.addEventListener('click', () => {
        if (currentEditorPageIndex > 0) {
            loadEditorPage(currentEditorPageIndex - 1);
        }
    });

    btnNextPage.addEventListener('click', () => {
        if (currentEditorPageIndex < editorPageMap.length - 1) {
            loadEditorPage(currentEditorPageIndex + 1);
        }
    });

    // --- Save Logic ---
    async function saveEditedPDF() {
        // --- 1. UI: Loading State ---
        const btnSave = document.querySelector('#edit-action-buttons .btn.is-primary');
        const originalBtnText = btnSave ? btnSave.innerHTML : '';

        if (btnSave) {
            btnSave.disabled = true;
            btnSave.innerHTML = '<i class="material-icons result-spin">sync</i> 保存中...';
            document.body.style.cursor = 'wait';
        }

        // UI描画時間を確保
        await new Promise(resolve => setTimeout(resolve, 50));

        try {
            // --- 2. メモリ対策済みJSON保存 ---
            if (fabricCanvas) {
                const originalBg = fabricCanvas.backgroundImage;
                fabricCanvas.backgroundImage = null;
                const json = fabricCanvas.toJSON(['id', 'selectable', 'boxHeight', 'boxBorderWidth', 'boxBorderColor', 'verticalAlign']);
                fabricCanvas.backgroundImage = originalBg;
                editorPages[currentEditorPageIndex] = { pageIndex: currentEditorPageIndex, fabricJSON: json };
            }

            // --- 3. PDF準備 ---
            const pdfDoc = await PDFLib.PDFDocument.load(currentEditorFile.data);
            pdfDoc.registerFontkit(fontkit);

            // ★変更: 軽量化のため、CJK(全アジア版/16MB)ではなく、JP(日本専用版/約4MB)のTTFを使用
            // Google Fontsの公式リポジトリから安定したTTFファイルを読み込む
            const fontUrlReg = 'https://raw.githubusercontent.com/googlefonts/noto-fonts/main/hinted/ttf/NotoSansJP/NotoSansJP-Regular.ttf';
            const fontUrlBold = 'https://raw.githubusercontent.com/googlefonts/noto-fonts/main/hinted/ttf/NotoSansJP/NotoSansJP-Bold.ttf';

            let fontRegular = null;
            let fontBold = null;

            // タイムアウト付きフェッチ関数（サイズが小さくなったのでタイムアウトは10秒に設定）
            const fetchWithTimeout = (url, ms) => {
                const controller = new AbortController();
                const id = setTimeout(() => controller.abort(), ms);
                return fetch(url, { signal: controller.signal })
                    .then(res => {
                        clearTimeout(id);
                        if (!res.ok) throw new Error(res.statusText);
                        return res.arrayBuffer();
                    });
            };

            try {
                console.log("Downloading fonts (JP TTF)...");
                // 並列ダウンロード開始
                const [bytesReg, bytesBold] = await Promise.all([
                    fetchWithTimeout(fontUrlReg, 10000),
                    fetchWithTimeout(fontUrlBold, 10000).catch(e => null)
                ]);

                if (bytesReg) fontRegular = await pdfDoc.embedFont(bytesReg);
                if (bytesBold) fontBold = await pdfDoc.embedFont(bytesBold);

            } catch (e) {
                console.warn("Font download failed.", e);
                alert("日本語フォントの読み込みに失敗しました。標準フォントで保存します。");
            }

            // --- 4. ページ描画ループ ---
            const pages = pdfDoc.getPages();

            for (let i = 0; i < pages.length; i++) {
                if (!editorPages[i] || !editorPages[i].fabricJSON) continue;

                const page = pages[i];
                const { width, height } = page.getSize();
                const scaleFactor = 1 / 1.5;
                const fabricData = editorPages[i].fabricJSON;

                if (fabricData.objects) {
                    for (const obj of fabricData.objects) {
                        const x = obj.left * scaleFactor;
                        const objHeight = (obj.height * obj.scaleY) * scaleFactor;
                        const objWidth = (obj.width * obj.scaleX) * scaleFactor;
                        const y = height - (obj.top * scaleFactor) - objHeight;

                        if (obj.type === 'textbox' || obj.type === 'i-text' || obj.type === 'text') {
                            const fontSize = obj.fontSize * obj.scaleX * scaleFactor;
                            const useBold = obj.fontWeight === 'bold' && fontBold;
                            const activeFont = useBold ? fontBold : (fontRegular || undefined);

                            // 背景色 (RGBA対応)
                            if (obj.backgroundColor && obj.backgroundColor !== 'transparent') {
                                let color = hexToRgb(obj.backgroundColor);
                                let opacity = 1;
                                if (!color && obj.backgroundColor.startsWith('rgba')) {
                                    const match = obj.backgroundColor.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)/);
                                    if (match) {
                                        color = PDFLib.rgb(parseInt(match[1]) / 255, parseInt(match[2]) / 255, parseInt(match[3]) / 255);
                                        opacity = match[4] ? parseFloat(match[4]) : 1;
                                    }
                                }
                                if (color) {
                                    page.drawRectangle({
                                        x: x, y: y, width: objWidth, height: objHeight,
                                        color: color, opacity: opacity
                                    });
                                }
                            }

                            // 枠線
                            if (obj.boxBorderWidth > 0 && obj.boxBorderColor) {
                                page.drawRectangle({
                                    x: x, y: y, width: objWidth, height: objHeight,
                                    borderColor: hexToRgb(obj.boxBorderColor),
                                    borderWidth: obj.boxBorderWidth * scaleFactor,
                                    color: undefined
                                });
                            }

                            // テキスト描画
                            const textY = height - (obj.top * scaleFactor) - (fontSize * 0.88);
                            page.drawText(obj.text, {
                                x: x, y: textY, size: fontSize,
                                font: activeFont, // フォント未取得時は undefined (Standard Font)
                                color: hexToRgb(obj.fill),
                                lineHeight: obj.lineHeight,
                                maxWidth: (obj.type === 'textbox') ? objWidth : undefined,
                            });

                            // 下線
                            if (obj.underline) {
                                const lineY = textY - 2;
                                page.drawLine({
                                    start: { x: x, y: lineY },
                                    end: { x: x + objWidth, y: lineY },
                                    thickness: Math.max(1, fontSize / 15),
                                    color: hexToRgb(obj.fill)
                                });
                            }

                        } else if (['rect', 'circle', 'triangle', 'ellipse'].includes(obj.type)) {
                            // 図形の描画 (既存ロジック)
                            const op = {
                                borderColor: hexToRgb(obj.stroke),
                                borderWidth: obj.strokeWidth * scaleFactor,
                                color: hexToRgb(obj.fill)
                            };

                            if (obj.type === 'rect') {
                                page.drawRectangle({ x: x, y: y, width: objWidth, height: objHeight, ...op });
                            } else if (obj.type === 'circle' || obj.type === 'ellipse') {
                                page.drawEllipse({
                                    x: x + objWidth / 2, y: y + objHeight / 2,
                                    xRadius: obj.rx * obj.scaleX * scaleFactor,
                                    yRadius: obj.ry * obj.scaleY * scaleFactor,
                                    ...op
                                });
                            } else if (obj.type === 'triangle') {
                                const points = [{ x: x + objWidth / 2, y: y + objHeight }, { x: x, y: y }, { x: x + objWidth, y: y }];
                                page.drawPolygon(points, op);
                            }
                        }
                    }
                }
            }

            const pdfBytes = await pdfDoc.save();
            downloadFile(pdfBytes, "edited_document.pdf");

        } catch (err) {
            console.error(err);
            alert("保存処理中にエラーが発生しました: " + err.message);
        } finally {
            if (btnSave) {
                btnSave.disabled = false;
                btnSave.innerHTML = originalBtnText;
                document.body.style.cursor = 'default';
            }
        }
    }

    function hexToRgb(hex) {
        if (!hex) return undefined;
        var shorthandRegex = /^#?([a-f\d])([a-f\d])([a-f\d])$/i;
        hex = hex.replace(shorthandRegex, function (m, r, g, b) {
            return r + r + g + g + b + b;
        });

        var result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
        return result ? PDFLib.rgb(
            parseInt(result[1], 16) / 255,
            parseInt(result[2], 16) / 255,
            parseInt(result[3], 16) / 255
        ) : undefined;
    }

    // --- ズーム機能とページ送りの修正 ---

    // 既存のイベントリスナーが競合しないように、ボタン要素をリセット（再取得・複製）して再設定します
    function setupControlButtons() {
        const resetElement = (id) => {
            const el = document.getElementById(id);
            if (el) {
                const newEl = el.cloneNode(true);
                el.parentNode.replaceChild(newEl, el);
                return newEl;
            }
            return null;
        };

        const newBtnZoomIn = resetElement('btn-zoom-in');
        const newBtnZoomOut = resetElement('btn-zoom-out');
        const newBtnPrev = resetElement('btn-prev-page');
        const newBtnNext = resetElement('btn-next-page');

        // ズーム表示の更新関数
        const updateZoomDisplay = () => {
            if (!zoomLevelText || !canvasWrapper) return;

            // 浮動小数点の誤差対策
            currentZoomScale = Math.round(currentZoomScale * 1000) / 1000;

            // 表示更新
            zoomLevelText.textContent = `${Math.round(currentZoomScale * 100)}%`;

            // スタイル適用
            canvasWrapper.style.transformOrigin = 'top center';
            canvasWrapper.style.transform = `scale(${currentZoomScale})`;

            // 拡大時の余白調整
            if (currentZoomScale > 1) {
                const margin = (currentZoomScale - 1) * 300; // 縦に見切れないよう余白を確保
                canvasWrapper.style.marginTop = `${margin}px`;
                canvasWrapper.style.marginBottom = `${margin}px`;
            } else {
                canvasWrapper.style.marginTop = '0';
                canvasWrapper.style.marginBottom = '0';
            }
        };

        // ズームイン（5%刻み）
        if (newBtnZoomIn) {
            newBtnZoomIn.addEventListener('click', () => {
                if (currentZoomScale < 3.0) {
                    currentZoomScale += 0.05;
                    updateZoomDisplay();
                }
            });
        }

        // ズームアウト（5%刻み）
        if (newBtnZoomOut) {
            newBtnZoomOut.addEventListener('click', () => {
                if (currentZoomScale > 0.3) {
                    currentZoomScale -= 0.05;
                    updateZoomDisplay();
                }
            });
        }

        // 前へボタン
        if (newBtnPrev) {
            newBtnPrev.addEventListener('click', () => {
                if (currentEditorPageIndex > 0) {
                    loadEditorPage(currentEditorPageIndex - 1);
                }
            });
        }

        // 次へボタン
        if (newBtnNext) {
            newBtnNext.addEventListener('click', () => {
                const maxPage = editorPageMap.length > 0 ? editorPageMap.length : 1;
                if (currentEditorPageIndex < maxPage - 1) {
                    loadEditorPage(currentEditorPageIndex + 1);
                }
            });
        }

        // 初回ズーム表示更新
        updateZoomDisplay();
    }

    // 設定を実行
    setupControlButtons();

});
