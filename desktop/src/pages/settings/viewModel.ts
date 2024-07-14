import { invoke } from '@tauri-apps/api/core'
import { ask, open } from '@tauri-apps/plugin-dialog'
import * as shell from '@tauri-apps/plugin-shell'
import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import * as config from '~/lib/config'
import { supportedLanguages } from '~/lib/i18n'
import { NamedPath, getAppInfo, getIssueUrl, getPrettyVersion, ls, resetApp } from '~/lib/utils'
import { usePreferenceProvider } from '~/providers/Preference'
import WhisperLanguages from '~/assets/whisper-languages.json'
import { UnlistenFn, listen } from '@tauri-apps/api/event'
import { useNavigate } from 'react-router-dom'
import { Store } from '@tauri-apps/plugin-store'
import { useStoreValue } from '~/lib/useStoreValue'

const store = new Store(config.storeFilename)

async function openModelPath() {
	let dst = await invoke<string>('get_models_folder')
	invoke('open_path', { path: dst })
}

async function openModelsUrl() {
	shell.open(config.modelsURL)
}

async function reportIssue() {
	try {
		const info = await getAppInfo()
		shell.open(await getIssueUrl(info))
	} catch (e) {
		console.error(e)
		shell.open(await getIssueUrl(`Couldn't get info ${e}`))
	}
}

async function openLogsFolder() {
	const dst = await invoke<string>('get_logs_folder')
	invoke('open_path', { path: dst })
}

async function copyLogs() {
	const logs = await invoke<string>("get_logs")
	navigator.clipboard.writeText(logs)
}

export function viewModel() {
	const { i18n } = useTranslation()
	const [isLogToFileSet, setLogToFile] = useStoreValue<boolean>('prefs_log_to_file')

	const [models, setModels] = useState<NamedPath[]>([])
	const [appVersion, setAppVersion] = useState('')
	const preference = usePreferenceProvider()
	const { t } = useTranslation()
	const listenersRef = useRef<UnlistenFn[]>([])
	const isMountedRef = useRef<boolean>(false)
	const [downloadURL, setDownloadURL] = useState('')
	const navigate = useNavigate()

	async function askAndReset() {
		const yes = await ask(t('common.reset-ask-dialog'), { kind: 'info' })
		if (yes) {
			resetApp()
		}
	}

	async function downloadModel() {
		if (!downloadURL) {
			return
		}
		navigate('/setup', { state: { downloadURL } })
	}

	async function loadMeta() {
		try {
			const prettyVersion = await getPrettyVersion()
			setAppVersion(prettyVersion)
		} catch (e) {
			console.error(e)
		}
	}

	async function loadModels() {
		const modelsFolder = await invoke<string>('get_models_folder')
		const entries = await ls(modelsFolder)
		const found = entries.filter((e) => e.name?.endsWith('.bin'))
		setModels(found)
	}

	async function getDefaultModel() {
		if (!preference.modelPath) {
			const modelsFolder = await invoke<string>('get_models_folder')

			let files = await ls(modelsFolder)
			files = files.filter((f) => f.name.endsWith('.bin'))
			if (files) {
				const defaultModelPath = files?.[0].path
				preference.setModelPath(defaultModelPath as string)
			}
		}
	}

	async function changeModelsFolder() {
		const path = await open({ directory: true, multiple: false })
		if (path) {
			await store.set('models_folder', path)
			await store.save()
			await loadModels()
			await getDefaultModel()
		}
	}

	async function changeLanguage() {
		await i18n.changeLanguage(preference.displayLanguage)
		const name = supportedLanguages[preference.displayLanguage]
		if (name) {
			preference.setModelOptions({ ...preference.modelOptions, lang: WhisperLanguages[name as keyof typeof WhisperLanguages] })
			preference.setTextAreaDirection(i18n.dir())
		}
	}
	async function onWindowFocus() {
		listenersRef.current.push(await listen('tauri://focus', loadModels))
	}
	useEffect(() => {
		if (!isMountedRef.current) {
			isMountedRef.current = true
			return
		}
		changeLanguage()
	}, [preference.displayLanguage])

	useEffect(() => {
		loadMeta()
		loadModels()
		getDefaultModel()
		onWindowFocus()
		return () => {
			listenersRef.current.forEach((unlisten) => unlisten())
		}
	}, [])

	useEffect(() => {}, [preference])

	return {
		copyLogs,
		isLogToFileSet,
		setLogToFile,
		downloadModel,
		downloadURL,
		setDownloadURL,
		preference: preference,
		askAndReset,
		openModelPath,
		openModelsUrl,
		openLogsFolder,
		models,
		appVersion,
		reportIssue,
		loadModels,
		changeModelsFolder,
	}
}
