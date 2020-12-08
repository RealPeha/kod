import React, { useEffect, useRef, useMemo, useCallback } from 'react'
import { Controlled as CodeMirror } from 'react-codemirror2'
import axios from 'axios'

import useMultipleState from './utils/useMultipleState'
import preventInfiniteLoop from './utils/preventInfiniteLoop'
import isUrl from './utils/isUrl'

import './Playground.css'

import 'codemirror/addon/hint/show-hint.css';
import 'codemirror/lib/codemirror.css'
import 'codemirror/theme/ayu-dark.css'
// import 'codemirror/theme/base16-light.css'
import './Theme.css'

import 'codemirror/mode/javascript/javascript'
import 'codemirror/addon/hint/show-hint'
import 'codemirror/addon/hint/javascript-hint'
import 'codemirror/addon/edit/closebrackets'

const codeMirrorOptions = {
    extraKeys: { 'Shift-Tab': 'autocomplete' },
    mode: { name: 'javascript', globalVars: true },
    // theme: 'base16-light',
    theme: 'ayu-dark',
    lineNumbers: true,
    scrollbarStyle: null,
    lineWrapping: true,
    autoCloseBrackets: true,
    cursorBlinkRate: 0,
    scanUp: true,
};

const getBlobURL = (code, type) => {
    const blob = new Blob([code], { type })
    
    return URL.createObjectURL(blob)
}

const Playground = ({
    options = codeMirrorOptions,
    files: inputFiles = [{ name: 'index', code: '' }],
}) => {
    const [{
        files,
        fileName,
        editFileName,
        editableFileNameElement,
        externalDependenciesCode,
    }, setState] = useMultipleState({
        files: inputFiles,
        fileName: inputFiles.find(({ name }) => name === 'index').name,
        editFileName: undefined,
        editableFileNameElement: undefined,
        externalDependenciesCode: [],
    })

    const iframeRef = useRef()
    const codeEditorRef = useRef()
    const externalDependencies = useRef([])

    const file = useMemo(() => files.find(({ name }) => name === fileName), [fileName])

    const executeCode = useCallback((jsCode) => {
        const js = `
            try {
                window.write = (...args) => {
                    document.querySelector('#logs').innerHTML = args.map(arg => {
                        if (arg === null) {
                            return 'null'
                        }
    
                        if (arg === undefined) {
                            return 'undefined'
                        }
    
                        if (typeof arg === 'object') {
                            return JSON.stringify(arg)
                        }
    
                        return arg.toString()
                    }).join(', ')
    
                    return 'jopa'
                }
                
                window.canvas = document.querySelector('#sandbox')
                window.ctx = canvas.getContext('2d')

                canvas.width = window.innerWidth;
                canvas.height = window.innerHeight;

                eval(\`${jsCode.replace(/\`/g, '\\`')}\`)
            } catch (e) {
                console.log(e)
                document.querySelector('#logs').innerHTML = ''
                const err=document.querySelector('#err');
                err.style.display='block';
                err.innerHTML=e
            }
        `

        const source = `
            <!DOCTYPE html><html lang='ru'>
            <head>
                <meta charset='UTF-8'>
                <meta name='viewport' content='width=device-width, initial-scale=1.0'>
                <meta http-equiv='X-UA-Compatible' content="ie=edge">
                <title>Kod</title>
                <style>
                    *{box-sizing:border-box}
                    body,html{margin:0;padding:0;width:100%;height:100%}
                    #err{color:tomato;padding:10px;display:none;position:absolute}
                    #logs{padding:10px;position:absolute}
                </style>
            </head>
            <body>
                <span id='logs'></span>
                <div id='err'></div>
                <canvas id='sandbox'></canvas>

                <script src='${getBlobURL(js, 'text/javascript')}'></script>
            </body></html>
        `

        URL.revokeObjectURL(iframeRef.current.src)
        
        iframeRef.current.src = getBlobURL(source, 'text/html')
    }, [])

    const buildCode = (files) => {
        const start = performance.now()

        const indexFile = files.find(({ name }) => name === 'index')
        const otherFile = files.filter(({ name }) => name !== 'index')

        let dependencyCode = ''

        const bundle = indexFile.code.replace(
            /^(?:(?!\/[\/*]))([ \t]*)(.*)import [\"\'\`](.+)(?:\.js)?[\"\'\`]\n(?![^\*]+\*\/)/gm,
            (match, tabs, prefix, fileName) => {
                if (isUrl(fileName)) {
                    if (!externalDependenciesCode[fileName]) {
                        externalDependencies.current = [...externalDependencies.current, fileName]
                    }

                    dependencyCode += externalDependenciesCode[fileName] || ''

                    return ''
                }

                const file = otherFile.find(({ name }) => name === fileName)

                return file ? preventInfiniteLoop(file.code) + '\n' : `throw new Error('File ${fileName} not found')\n`
            }
        );

        console.log(`Built in ${(performance.now() - start).toPrecision(2)}ms`)

        return `
            ${dependencyCode}
            eval(\`${bundle.replace(/`/g, '\\`')}\`)
        `
    }

    const handleChange = (editor, data, code) => {
        if (!codeEditorRef.current.classList.contains('hide-cursor')) {
            codeEditorRef.current.classList.add('hide-cursor')
        }

        const updateFiles = files.map(file => {
            if (file.name === fileName) {
                file.code = code
            }

            return file
        })

        setState({ files: updateFiles })

        const bundle = buildCode(updateFiles)

        executeCode(bundle)
    }

    const handleSelectFile = (name) => (e) => {
        if (name === fileName && name !== 'index') { // if clicked on the current file
            setState({
                editableFileNameElement: e.currentTarget,
                editFileName: name,
            })
            return
        }

        setState({ fileName: name })
    }

    const handleFilenameSave = e => {
        if (e.keyCode === 13) { // Enter
            saveFileName()
        }
    }

    const handleAddFile = () => {
        const baseName = 'Untitled'
        let name = baseName
        let n = 1

        while (files.some(file => file.name === name)) {
            name = `${baseName} ${n++}`
        }

        setState({
            files: [...files, { name, code: '' }]
        })
    }

    const saveFileName = () => {
        const newFilename = editableFileNameElement.innerHTML.trim()

        const canUpdate = newFilename.length < 50
            && !files.some(({ name }) => name === newFilename)

        if (canUpdate) {
            if (!newFilename) {
                const updatedFiles = files.filter(({ name }) => name !== editFileName)

                setState({
                    fileName: 'index',
                    files: updatedFiles,
                })
            } else {
                const updatedFiles = files.map(file => {
                    if (file.name === editFileName) {
                        file.name = newFilename
                    }
        
                    return file
                })

                setState({
                    fileName: newFilename,
                    files: updatedFiles,
                })
            }
        } else {
            editableFileNameElement.innerHTML = editFileName // restore file name
        }

        setState({
            editableFileNameElement: undefined,
            editFileName: undefined,
        })
    }

    const handleMouseDown = ({ target }) => {
        // only if edit mode is active
        if (editFileName) {
            // if click outside or click on another file
            if (
                !target.className.includes('filename')
                || (target.className.includes('filename') && target.innerHTML !== editFileName)
            ) {
                saveFileName()
            }
        }
    }

    useEffect(() => {
        const bundle = buildCode(files)

        executeCode(bundle)

        const handleMouseMove = () => {
            codeEditorRef.current.classList.remove('hide-cursor')
        }

        codeEditorRef.current.addEventListener('mousemove', handleMouseMove)

        return () => codeEditorRef.current.removeEventListener('mousemove', handleMouseMove)
    }, [])

    useEffect(() => {
        document.addEventListener('mousedown', handleMouseDown)

        return () => document.removeEventListener('mousedown', handleMouseDown)
    }, [handleMouseDown])

    useEffect(() => {
        if (editableFileNameElement) {
            editableFileNameElement.focus()
        }
    }, [editableFileNameElement, editFileName])

    useEffect(() => {
        const load = async () => {
            for (const dependency of externalDependencies.current) {
                if (!externalDependenciesCode[dependency]) {
                    const dependencyCode = await axios.get(dependency)

                    setState({
                        externalDependenciesCode: {
                            ...externalDependenciesCode,
                            [dependency]: dependencyCode.data,
                        },
                    })
                }
            }
        }

        load()
    }, [externalDependencies.current])

    return (
        <div className='playground'>
            <div className='code-wrapper hide-cursor' ref={codeEditorRef}>
                <div className={`files-wrapper ${options.theme}`}>
                    {files.map(({ name }) => {
                        return (
                            <div
                                key={name}
                                className={`filename${name === fileName ? ' active' : ''}`}
                                onClick={handleSelectFile(name)}
                                contentEditable={editFileName === name}
                                suppressContentEditableWarning
                                onKeyDown={handleFilenameSave}
                            >
                                {name}
                            </div>
                        )
                    })}
                    <div className='plus' onClick={handleAddFile}></div>
                </div>
                <CodeMirror
                    value={file.code}
                    options={options}
                    onBeforeChange={handleChange}
                    className='code-editor'
                />
            </div>
            <div className='result-wrapper'>
                <iframe title='result' className='result-iframe' ref={iframeRef} />
            </div>
        </div>
    )
}

export default Playground
