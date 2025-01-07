import {
  Card,
  Box,
  CardContent,
  CardHeader,
  ToggleButton,
  Tooltip,
  tooltipClasses,
  Button,
  Stack,
  CircularProgress,
  Menu,
  MenuItem,
  ListItemText, ListItemIcon
} from '@mui/material';
import BackgroundImage from '../assets/images/background.png'

import { useEffect, useRef, useState } from 'react';
import { useTheme } from '@mui/material/styles';
import { useTranslation} from 'react-i18next';
import { Module } from '../types/Module';

import FullScreenIcon from '../components/icons/FullScreenIcon';
import DeleteIcon from '../components/icons/DeleteIcon';
import LaunchIcon from '../components/icons/LaunchIcon';
import TerminalIcon from '../components/icons/TerminalIcon';
import UploadIcon from '../components/icons/UploadIcon';

import ZipIcon from '../components/icons/ZipIcon';
import ActionConfirmation from '../components/ActionConfirmation';
import { ModuleInstance } from './module'
import { directoryInputHandler, zipInputHandler, zipInputReader } from './dataInput';
import FolderIcon from "../components/icons/FolderIcon.tsx";
import DemoIcon from "../components/icons/DemoIcon.tsx";
import sha256 from "./sha256.ts";

const DEMO_URL = 'https://archive.org/download/HeroesofMightandMagicIITheSuccessionWars_1020/h2demo.zip';
const DEMO_DOWNLOAD_URL = `https://corsproxy.io/?url=${encodeURI(DEMO_URL)}`;
const DEMO_HASH = '12048c8b03875c81e69534a3813aaf6340975e77b762dc1b79a4ff5514240e3c'

export default () => {
  const { t } = useTranslation();
  const theme = useTheme();

  const [downloadProgress, reportDownloadProgress] = useState(0);

  const [instance, setInstance] = useState<Module>();
  const [initialized, setInitialized] = useState(false);
  const [mainRunning, setMainRunning] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const [hasData, setHasData] = useState(false);
  const [anchorEl, setAnchorEl] = useState<HTMLButtonElement>();

  const [showConsole, setShowConsole] = useState(true)
  const [messages, setMessages] = useState<Array<string>>([]);
  const pushMessage = (msg: string) => setMessages(messages => {
    messages.reverse().length = Math.min(messages.length, 200);
    return [...messages.reverse(), msg]
  });

  const [openDeleteConfirmation, setOpenDeleteConfirmation] = useState(false)

  const [logbox, canvas, directoryInput, zipInput] = [
    useRef<HTMLDivElement>(null),
    useRef<HTMLCanvasElement>(null),
    useRef<HTMLInputElement>(null),
    useRef<HTMLInputElement>(null)
  ];

  useEffect(() => {
    logbox.current?.scrollIntoView({
      behavior: 'smooth',
      block: 'end'
    });
  }, [showConsole, messages]);

  useEffect(() => {//disable canvas context menu
    if (!canvas.current) return;
    const handler = (e: MouseEvent) => e.preventDefault();
    canvas.current.addEventListener('contextmenu', handler)
    return () => canvas.current?.removeEventListener('contextmenu', handler);
  }, [canvas]);

  useEffect(function critical () {//init wasm module instance
    if (!canvas.current) return;
    if ((critical as any)['lock']) return;
    (critical as any)['lock'] = true;
    pushMessage(`Starting wasm module...`);
    ModuleInstance({
      ENV: {
        HOME: '/fheroes2',
        FHEROES2_DATA: `/fheroes2/data`
      },
      canvas: canvas.current,
      pushMessage,
      reportDownloadProgress,
    }).then(setInstance)
      .catch(() => pushMessage(`WASM module start failed`))
  }, [canvas])

  useEffect(() => {
    if (!instance) return;
    instance.print(`Looking up data in [${instance.ENV.FHEROES2_DATA}]`)
    try {
      setHasData(Object.keys(instance.FS.lookupPath(`${instance.ENV.FHEROES2_DATA}`).node.contents).length > 0);
      instance.print(`Local data found we are ready to start...`)
    }
    catch (ignore) {
      instance.FS.mkdir(`${instance.ENV.FHEROES2_DATA}`);
      instance.print('No local data found...')
    }
    finally {
      setInitialized(true);
    }
  }, [instance])

  useEffect(() => {//handle folder input
    const { current } = directoryInput;
    if (!current || !instance) return;

    const handler = directoryInputHandler(instance, setHasData);
    current.addEventListener('input', handler);

    return () => current.removeEventListener('input', handler);
  }, [directoryInput, instance]);

  useEffect(() => {//handle zip input
    const { current } = zipInput;
    if (!current || !instance) return;

    const handler = zipInputHandler(instance, setHasData);
    current.addEventListener('input', handler);

    return () => current.removeEventListener('input', handler);
  }, [zipInput, instance]);

  const fetchDemoData = () => {
    if (!instance) return;
    setInitialized(false);
    instance.print(`Fetching demo data from [${DEMO_URL}]\nExpexted hash is [${DEMO_HASH}]`)
    fetch(DEMO_DOWNLOAD_URL)
      .then(res => res.blob())
      .then(async blob => {
        instance.print('Checking hash...');
        const hash = await sha256(blob);
        if (hash !== DEMO_HASH) throw('Bad hash');
        instance.print('Hash is ok... Initializing.');
        zipInputReader(instance, setHasData, blob)
      })
      .catch(e => instance.print(`Failed to get demo version: ${e?.message ?? 'unknow error'}`))
      .finally(() => setInitialized(true))
  }

  const clearPath = (basePath: string) => {
    if (!instance) return;
    try {
      Object.entries(instance.FS.lookupPath(basePath).node.contents).forEach(([path, { isFolder }]) => {
        instance.print(`Clearing ${basePath}/${path}`)
        isFolder
            ? clearPath(`${basePath}/${path}`)
            : instance.FS.unlink(`${basePath}/${path}`)
      })
      instance.FS.rmdir(`${basePath}`)
    } catch (err) { instance.print(`Failed to remove stored data ${err}`) }
  };

  const removeData = () => {
    setOpenDeleteConfirmation(true);
  }

  const runInstance = () => {
    if (!instance) return;
    instance.callMain();
    setMainRunning(true);
    setShowConsole(false);
  }

  useEffect(function critical () {
    const handler = (e: Event) => {
      setFullscreen(!!document.fullscreenElement);
    }
    document.addEventListener('fullscreenchange', handler);

    return () => document.removeEventListener('fullscreenchange', handler);
  }, [])

  useEffect(() => {
    instance?.print(fullscreen
      ? 'Entered fullscreen mode'
      : 'Exited fullscreen mode')
  }, [fullscreen])

  const doFullScreen = () => {
    instance?.print('Entering fullscreen mode')
    canvas.current?.requestFullscreen()
      .catch(() => instance?.print('Fullscreen request failed'));
  }

  return (
    <Card
      elevation={0}
      sx={{
        position: 'relative',
        border: '1px solid',
        borderRadius: 1,
        borderColor: theme.palette.divider,
      }}
    >
      <CardHeader
        titleTypographyProps={{ variant: 'subtitle1' }}
        title={''}
        sx={{ p: '8px 12px', height: '44px' }}
        action={<>
          <Stack direction={"row"} spacing={2}>
            {!initialized && <CircularProgress color="warning" size="34px" />}
            {initialized && !hasData && <Button
              sx={{ fontSize: '1em', height: '36px' }}
              variant="contained"
              onClick={e => setAnchorEl(e.currentTarget)}
            >
              <UploadIcon width="2.4em" height="2.4em" style={{ margin: '0 1em 0 0' }} />{t('menu.Add game data')}
            </Button>}
              <Menu open={Boolean(anchorEl)} anchorEl={anchorEl} onClose={() => setAnchorEl(undefined)}>
                <MenuItem onClick={() => { zipInput.current?.click(); setAnchorEl(undefined) }} disabled={!zipInput.current} sx={{fontSize: '10px'}}>
                  <ListItemIcon><ZipIcon width="2.4em" height="2.4em" style={{ margin: '0 1em 0 0' }} /></ListItemIcon>
                  <ListItemText>{t('menu.Select zip archive')}</ListItemText>
                </MenuItem>
                <MenuItem onClick={() => { directoryInput.current?.click(); setAnchorEl(undefined) }} disabled={!directoryInput.current} sx={{fontSize: '10px'}}>
                  <ListItemIcon><FolderIcon width="2.4em" height="2.4em" style={{ margin: '0 1em 0 0' }} /></ListItemIcon>
                  <ListItemText>{t('menu.Select data folder')}</ListItemText>
                </MenuItem>
                <MenuItem onClick={() => { fetchDemoData(); setAnchorEl(undefined) }} sx={{fontSize: '10px'}}>
                  <ListItemIcon><DemoIcon width="2.4em" height="2.4em" style={{ margin: '0 1em 0 0' }} /></ListItemIcon>
                  <ListItemText>{t('menu.Try demo')}</ListItemText>
                </MenuItem>
              </Menu>
            {initialized && hasData && !mainRunning && <Button
                sx={{ fontSize: '1em', height: '36px' }}
                variant="contained"
                onClick={() => runInstance()}
            ><LaunchIcon width="2.4em" height="2.4em" style={{ margin: '0 1em 0 0' }} /> {t('menu.Run')}</Button>}
            {initialized && hasData && !mainRunning && <Button
              sx={{ fontSize: '1em', height: '36px' }}
              variant="contained"
              onClick={() => removeData()}
            ><DeleteIcon width="2.4em" height="2.4em" style={{ margin: '0 1em 0 0' }} /> {t('menu.Remove data')}</Button>}
            {mainRunning && <Tooltip title={t('menu.Toggle Fullscreen')} slotProps={{ popper: { sx: {
                  [`&.${tooltipClasses.popper}[data-popper-placement*="bottom"] .${tooltipClasses.tooltip}`]: { marginTop: '0px', color: '#000', fontSize: '1em' }
                } }}}>
                <ToggleButton value="web" selected={fullscreen} sx={{ p: '3px 6px', height: '36px' }} onClick={() => doFullScreen()}>
                    <FullScreenIcon width="2.4em" height="2.4em" />
                </ToggleButton>
            </Tooltip>}
            <Tooltip title={t('menu.Toggle Console')} slotProps={{ popper: { sx: {
                [`&.${tooltipClasses.popper}[data-popper-placement*="bottom"] .${tooltipClasses.tooltip}`]: { marginTop: '0px', color: '#000', fontSize: '1em' }
              } }}}>
                <ToggleButton value="web" selected={showConsole} sx={{ p: '3px 6px', height: '36px' }} onClick={() => setShowConsole(!showConsole)}>
                  <TerminalIcon width="2.4em" height="2.4em" />
              </ToggleButton>
            </Tooltip>
          </Stack>
        </>}
      />
      <input
        ref={directoryInput}
        style={{ display: 'none' }}
        type="file"
        multiple
        //@ts-ignore
        webkitdirectory={'directory'}
        directory={'directory'}
      />
      <input
        ref={zipInput}
        type="file"
        accept="application/zip"
        style={{ display: 'none' }}
      />
      <CardContent sx={{
        p: 0,
        m: 0,
        background: `url(${BackgroundImage}) center center`,
        backgroundSize: 'cover',
        height: 'calc(100vh - 46px)',
        position: 'relative',
        '&:last-child': {
          paddingBottom: 0
        }}}>
        <Box sx={{
          bgcolor: 'rgba(0, 0, 0, 0.4)',
          height: showConsole ? '100%' : 0,
          width: '100%',
          whiteSpace: 'pre',
          overflowY: 'auto',
          fontFamily: 'Heroes2-pixed',
          position: 'absolute',
          zIndex: 1000
        }}>
          {messages.join('\n')}
          <div ref={logbox}></div>
        </Box>
        <canvas id="canvas" ref={canvas} width={640} height={480} style={{
          width: '100%', height: '100%', position: 'absolute', zIndex: 100
        }}></canvas>
      </CardContent>
      <ActionConfirmation
        open={openDeleteConfirmation}
        title={t('confirm.Are you sure?')}
        handleClose={(status) => {
          setOpenDeleteConfirmation(false);
          if (!status || !instance) return;

          clearPath(String(instance.ENV.FHEROES2_DATA));
          instance.FS.syncfs(false, err => {
            if (err) return instance.print(`Failed to remove data at [${instance.ENV.FHEROES2_DATA}]`);
            setHasData(false)
            setShowConsole(true)
          });

        }}
        color="error" />
    </Card>
  )
}
