// FILE MANAGER PANEL COMPONENT

export class FileManagerPanel {
    constructor() {
        this.initializeElements();
        this.bindEvents();
        this.refreshFiles();
        this.autoFetchAssets();
    }

    initializeElements() {
        this.fileContainer = document.getElementById('fileContainer');
        this.generatedFilesList = document.getElementById('generatedFilesList');
        this.refreshFilesBtn = document.getElementById('refreshFilesBtn');
        
        // Logo upload elements
        this.logoUploadZone = document.getElementById('logoUploadZone');
        this.logoUpload = document.getElementById('logoUpload');
        this.logoFilesList = document.getElementById('logoFilesList');
        
        // Signature upload elements
        this.signatureUploadZone = document.getElementById('signatureUploadZone');
        this.signatureUpload = document.getElementById('signatureUpload');
        this.signatureFilesList = document.getElementById('signatureFilesList');
        
        // Template upload elements
        this.templateUploadZone = document.getElementById('templateUploadZone');
        this.templateUpload = document.getElementById('templateUpload');
        this.templateFilesList = document.getElementById('templateFilesList');
    }

    bindEvents() {
        this.refreshFilesBtn.addEventListener('click', this.refreshFiles.bind(this));
        
        // Logo upload events
        this.logoUploadZone.addEventListener('click', () => this.logoUpload.click());
        this.logoUploadZone.addEventListener('dragover', (e) => this.handleDragOver(e, 'logo'));
        this.logoUploadZone.addEventListener('drop', (e) => this.handleFileDrop(e, 'logo'));
        this.logoUpload.addEventListener('change', (e) => this.handleAssetUpload(e, 'logo'));
        
        // Signature upload events  
        this.signatureUploadZone.addEventListener('click', () => this.signatureUpload.click());
        this.signatureUploadZone.addEventListener('dragover', (e) => this.handleDragOver(e, 'signature'));
        this.signatureUploadZone.addEventListener('drop', (e) => this.handleFileDrop(e, 'signature'));
        this.signatureUpload.addEventListener('change', (e) => this.handleAssetUpload(e, 'signature'));
        
        // Template upload events
        this.templateUploadZone.addEventListener('click', () => this.templateUpload.click());
        this.templateUploadZone.addEventListener('dragover', (e) => this.handleDragOver(e, 'template'));
        this.templateUploadZone.addEventListener('drop', (e) => this.handleFileDrop(e, 'template'));
        this.templateUpload.addEventListener('change', (e) => this.handleAssetUpload(e, 'template'));
    }

    // Auto-fetch stored assets from server on initialization
    async autoFetchAssets() {
        console.log('🔍 Auto-fetching stored assets from server...');
        
        try {
            // Fetch assets from each directory
            const assetTypes = ['logo', 'signature', 'template'];
            
            for (const type of assetTypes) {
                await this.fetchAssetsForType(type);
            }
            
            console.log('✅ Auto-fetch completed for all asset types');
            
        } catch (error) {
            console.error('❌ Auto-fetch assets error:', error);
        }
    }

    // Fetch assets for a specific type (logo, signature, template)
    async fetchAssetsForType(type) {
        try {
            const response = await fetch(`${window.CONFIG?.API_BASE || ''}/assets/${type}`);
            
            if (response.ok) {
                const files = await response.json();
                this.displayFetchedAssets(files, type);
            } else {
                console.log(`📁 No existing ${type} files found on server`);
                // Show appropriate default message
                const filesList = this.getFilesList(type);
                if (filesList) {
                    const defaultMessage = type === 'template' ? 'Using default template' : `No ${type} uploaded`;
                    filesList.innerHTML = `<div class="no-files">${defaultMessage}</div>`;
                }
            }
        } catch (error) {
            console.log(`📁 Could not fetch ${type} assets:`, error.message);
            // This is expected when server endpoints are not yet implemented
        }
    }

    // Display fetched assets in the UI
    displayFetchedAssets(files, type) {
        const filesList = this.getFilesList(type);
        
        if (!files || files.length === 0) {
            const defaultMessage = type === 'template' ? 'Using default template' : `No ${type} uploaded`;
            filesList.innerHTML = `<div class="no-files">${defaultMessage}</div>`;
            return;
        }

        // Display each found file
        filesList.innerHTML = files.map(file => `
            <div class="file-item fetched">
                <div class="file-icon">${this.getFileIcon(file.name)}</div>
                <div class="file-info">
                    <div class="file-name">${file.name}</div>
                    <div class="file-size">${this.formatFileSize(file.size || 0)}</div>
                </div>
                <div class="file-actions">
                    <button onclick="window.fileManager.previewAsset('${type}', '${file.name}')">👁️</button>
                    <button onclick="window.fileManager.removeStoredAsset('${type}', '${file.name}')">🗑️</button>
                </div>
            </div>
        `).join('');

        console.log(`📁 Displayed ${files.length} ${type} files`);
    }

    // Preview stored asset
    previewAsset(type, filename) {
        const assetUrl = `${window.CONFIG?.API_BASE || ''}/assets/${type}/${filename}`;
        window.open(assetUrl, '_blank');
    }

    // Remove stored asset from server
    async removeStoredAsset(type, filename) {
        if (!confirm(`Remove stored ${type} file: ${filename}?`)) {
            return;
        }

        try {
            const response = await fetch(`${window.CONFIG?.API_BASE || ''}/assets/${type}/${filename}`, {
                method: 'DELETE'
            });

            if (response.ok) {
                window.showNotification(`🗑️ ${filename} removed from server`, 'info');
                // Refresh the assets for this type
                await this.fetchAssetsForType(type);
            } else {
                throw new Error('Failed to remove file from server');
            }
        } catch (error) {
            console.error(`❌ Error removing ${type} file:`, error);
            window.showNotification(`❌ Failed to remove ${filename}`, 'error');
        }
    }

    handleDragOver(e, type) {
        e.preventDefault();
        const zone = this.getUploadZone(type);
        zone.classList.add('drag-over');
    }

    handleFileDrop(e, type) {
        e.preventDefault();
        const zone = this.getUploadZone(type);
        zone.classList.remove('drag-over');
        
        const files = Array.from(e.dataTransfer.files);
        this.handleAssetUpload({ target: { files } }, type);
    }

    async handleAssetUpload(event, type) {
        const files = Array.from(event.target.files);
        
        for (const file of files) {
            // Validate file type
            if (!this.validateFileType(file, type)) {
                window.showNotification(`❌ Invalid file type for ${type}`, 'error');
                continue;
            }
            
            await this.uploadAssetToServer(file, type);
        }
    }

    // Upload asset file to server
    async uploadAssetToServer(file, type) {
        const section = this.getUploadSection(type);
        section.classList.add('uploading');
        
        try {
            const formData = new FormData();
            formData.append('file', file);
            formData.append('type', type);
            
            console.log(`📤 Uploading ${file.name} as ${type} to server...`);
            
            const response = await fetch(`${window.CONFIG?.API_BASE || ''}/upload-asset`, {
                method: 'POST',
                body: formData
            });
            
            const result = await response.json();
            
            if (response.ok && result.success) {
                console.log(`✅ ${file.name} uploaded successfully to server`);
                window.showNotification(`📁 ${file.name} uploaded successfully`, 'success');
                
                // Refresh the assets for this type to show the uploaded file
                await this.fetchAssetsForType(type);
            } else {
                throw new Error(result.error || 'Upload failed');
            }
            
        } catch (error) {
            console.error(`❌ Upload error:`, error);
            window.showNotification(`❌ Failed to upload ${file.name}: ${error.message}`, 'error');
        } finally {
            section.classList.remove('uploading');
        }
    }

    validateFileType(file, type) {
        const validTypes = {
            logo: ['image/jpeg', 'image/png', 'image/svg+xml'],
            signature: ['image/jpeg', 'image/png', 'image/svg+xml'], 
            template: ['text/html', 'application/html']
        };
        
        return validTypes[type]?.includes(file.type) || 
               (type === 'template' && file.name.endsWith('.html'));
    }

    getUploadZone(type) {
        switch(type) {
            case 'logo': return this.logoUploadZone;
            case 'signature': return this.signatureUploadZone;
            case 'template': return this.templateUploadZone;
            default: return null;
        }
    }

    getUploadSection(type) {
        return this.getUploadZone(type).parentElement;
    }

    displayUploadedFile(file, type) {
        const filesList = this.getFilesList(type);
        filesList.innerHTML = `
            <div class="file-item uploaded">
                <div class="file-icon">${this.getFileIcon(file.name)}</div>
                <div class="file-info">
                    <div class="file-name">${file.name}</div>
                    <div class="file-size">${this.formatFileSize(file.size)}</div>
                </div>
                <div class="file-actions">
                    <button onclick="window.fileManager.removeFile('${type}')">🗑️</button>
                </div>
            </div>
        `;
    }

    getFilesList(type) {
        switch(type) {
            case 'logo': return this.logoFilesList;
            case 'signature': return this.signatureFilesList;
            case 'template': return this.templateFilesList;
            default: return null;
        }
    }

    removeFile(type) {
        if (confirm(`Remove ${type} file?`)) {
            const filesList = this.getFilesList(type);
            filesList.innerHTML = `<div class="no-files">No ${type} uploaded</div>`;
            window.showNotification(`🗑️ ${type} file removed`, 'info');
        }
    }

    getFileType(file) {
        if (file.type.startsWith('image/')) return 'logo';
        if (file.name.endsWith('.html')) return 'template';
        return 'document';
    }

    refreshFiles() {
        fetch(`${window.CONFIG.API_BASE}/files/generated`)
            .then(response => response.json())
            .then(files => this.displayFilesList(files, this.generatedFilesList, 'generated'))
            .catch(console.error);
        
        // For now, these endpoints need to be implemented
        console.log('📁 File refresh functionality needs API endpoints');
    }

    displayFilesList(files, container, type) {
        if (!files.length) {
            container.innerHTML = `<div class="no-files">No ${type} files yet</div>`;
            return;
        }
        
        container.innerHTML = files.map(file => `
            <div class="file-item">
                <div class="file-icon">${this.getFileIcon(file.name)}</div>
                <div class="file-info">
                    <div class="file-name">${file.name}</div>
                    <div class="file-size">${this.formatFileSize(file.size)}</div>
                </div>
                <div class="file-actions">
                    <button onclick="window.fileManager.downloadFile('${file.path}')">⬇️</button>
                    ${type === 'asset' ? `<button onclick="window.fileManager.deleteFile('${file.path}')">🗑️</button>` : ''}
                </div>
            </div>
        `).join('');
    }

    handleFileGenerated(data) {
        const { filename, file_type, download_url } = data;
        window.showNotification(`📄 ${filename} generated`, 'success');
        this.refreshFiles();
    }

    downloadFile(path) {
        window.open(`${window.CONFIG.API_BASE}${path}`, '_blank');
    }

    deleteFile(path) {
        if (confirm('Are you sure you want to delete this file?')) {
            fetch(`${window.CONFIG.API_BASE}/delete-file`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ path })
            })
            .then(() => {
                this.refreshFiles();
                window.showNotification('🗑️ File deleted', 'info');
            })
            .catch(console.error);
        }
    }

    getFileIcon(filename) {
        const ext = filename.split('.').pop().toLowerCase();
        const icons = {
            pdf: '📄', html: '🌐', xlsx: '📊', png: '🖼️', jpg: '🖼️', jpeg: '🖼️', svg: '🎨'
        };
        return icons[ext] || '📁';
    }

    formatFileSize(bytes) {
        if (bytes === 0) return '0 B';
        const k = 1024;
        const sizes = ['B', 'KB', 'MB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
    }
}