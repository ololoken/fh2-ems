import {
  Card, Box,
  CardContent, CardHeader,
  LinearProgress, ToggleButton, Tooltip, tooltipClasses, Button, Stack
} from '@mui/material';
import BackgroundImage from '../assets/images/background.png'
import throwExpression from '../common/throwExpression';

import { useEffect, useRef, useState } from 'react';
import { useTheme } from '@mui/material/styles';
import { useTranslation} from 'react-i18next';
import { DepsState, ModuleInitialized, RunDependency } from '../types/Module';

import DeleteIcon from '../components/icons/DeleteIcon';
import LaunchIcon from '../components/icons/LaunchIcon';
import TerminalIcon from '../components/icons/TerminalIcon';
import UploadIcon from '../components/icons/UploadIcon';
import ZipIcon from '../components/icons/ZipIcon';

import { BlobReader, ZipReader, Uint8ArrayWriter } from '@zip.js/zip.js';

import ActionConfirmation from '../components/ActionConfirmation';
import { ModuleInstance } from './module'

let module: ModuleInitialized;

const whitListedFolders = ['data', 'heroes2', 'maps', 'music'];
const requiredFiles = ['data/HEROES2.AGG', 'data/HEROES2X.AGG']

const filterInput = (relativePath: string) => {
  if (relativePath.endsWith('/')) return false;
  const [fileName, ...path] = relativePath.split('/').reverse();
  if (fileName.startsWith('.')) return false;
  return path
    .map(folder => folder.toLocaleLowerCase())
    .some(folder => whitListedFolders.includes(folder))
}

export default () => {
  const { t } = useTranslation();
  const theme = useTheme();

  const [downloadProgress, reportDownloadProgress] = useState(0);

  const [instance, setInstance] = useState<any>();
  const [dependencies, setDependencies] = useState<DepsState>({})

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

  useEffect(() => {
    if (!canvas.current) return;
    canvas.current.oncontextmenu = e => e.preventDefault();

    if (module) return;

    module = ModuleInstance({
      ENV: {
        HOME: '/fheroes2',
        FHEROES2_DATA: `/fheroes2/data`
      },
      canvas: canvas.current,
      pushMessage,
      reportDownloadProgress,
      setDependencies
    });
    module.instance.then(setInstance).catch(err => pushMessage(`Failed to init wasm module: [${err}]`));
  }, [canvas]);

  const mkdirWithParents = (path: string) => {
    const parts = path.split('/');
    try { module.FS.lookupPath(parts.join('/')) }
    catch (ignore) {
      parts.reduce((p, part) => {
        p = [...p, part];
        try { module.FS.lookupPath(p.join('/')) }
        catch (ignore) { module.FS.mkdir(p.join('/')) }
        return p;
      }, new Array<string>());
    }
  }

  useEffect(() => {
    const { current } = directoryInput;
    if (!current) return;
    const handler = ({ target }: Event) => {
      const input = target as HTMLInputElement;
      if (!input.files) return module.print('No files selected');

      const files = [...input.files];
      input.value = '';

      if (files.length === 1) return module.print('zip archives are not supported yet, sorry');
      if (files.length > 3000) return module.print('wrong directory, or your maps collection is really awesome.');

      setShowConsole(true)
      const filtered = files.filter(({ webkitRelativePath }) => filterInput(webkitRelativePath));

      const requiredResolved = filtered.filter(({ webkitRelativePath: path }) =>
        requiredFiles.some(rq => path.toLocaleLowerCase().endsWith(rq.toLocaleLowerCase()))).length === 2;
      if (!requiredResolved) return module.print('Required data not found in directory');

      filtered.reduce((uploaded, file) => {
        const [fileName, ...path] = file.webkitRelativePath.split('/').reverse();
        const [ignore, ...relativePath] = path.reverse();

        mkdirWithParents(`${module.ENV.FHEROES2_DATA}/${relativePath.join('/')}`);

        const reader = new FileReader();
        reader.addEventListener('error', console.error);
        reader.addEventListener('loadend', ({ target }) => {
          const uri = `${module.ENV.FHEROES2_DATA}/${relativePath.join('/')}/${fileName}`;
          module.print(`Writing file ${uri} to virtual fs from ${file.webkitRelativePath}`);
          module.FS.writeFile(`${uri}`, new Uint8Array(target?.result as ArrayBuffer ?? throwExpression('')), {
            encoding: 'binary'
          });
          uploaded.push(uri);
          if (uploaded.length === filtered.length) {
            module.print(`Data bundle looks ok. Continue initialization...`)
            module.FS.syncfs(false, err => {
              if (err) return module.print('Failed to sync FS');
              module.removeRunDependency(RunDependency.data);
              setDependencies(deps => ({ ...deps, [RunDependency.data]: true }));
            })
          }
        });
        reader.readAsArrayBuffer(file);
        return uploaded;
      }, new Array<string>);
    }

    current.addEventListener('input', handler);
    return () => current.removeEventListener('input', handler);
  }, [directoryInput]);

  useEffect(() => {
    const { current } = zipInput;
    if (!current) return;
    const handler = ({ target }: Event) => {
      const input = target as HTMLInputElement;
      const file = input.files?.[0] ?? throwExpression('no file provided');
      input.value = '';
      const reader = new ZipReader(new BlobReader(file));
      reader.getEntries({})
        .then(entries => entries.filter(({ filename: relativePath }) => filterInput(relativePath)))
        .then(filtered => filtered.reduce((uploaded, entry) => {
          const [fileName, ...path] = entry.filename.split('/').reverse();
          const [ignore, ...relativePath] = path.reverse();

          mkdirWithParents(`${module.ENV.FHEROES2_DATA}/${relativePath.join('/')}`);

          entry.getData?.(new Uint8ArrayWriter).then(data => {
            const uri = `${module.ENV.FHEROES2_DATA}/${relativePath.join('/')}/${fileName}`;
            module.print(`Writing file ${uri} to virtual fs from provided zip archive`);
            module.FS.writeFile(`${uri}`, data, {
              encoding: 'binary'
            });
            uploaded.push(uri);
            if (uploaded.length === filtered.length) {
              module.print(`Data bundle looks ok. Continue initialization...`)
              module.FS.syncfs(false, err => {
                if (err) return module.print('Failed to sync FS');
                module.removeRunDependency(RunDependency.data);
                setDependencies(deps => ({ ...deps, [RunDependency.data]: true }));
              })
            }
          })

          return uploaded;
        }, new Array<string>))
    }

    current.addEventListener('input', handler);
    return () => current.removeEventListener('input', handler);
  }, [zipInput]);

  useEffect(() => {
    if (!dependencies?.[RunDependency.data]) return;
    setShowConsole(false);
  }, [dependencies])

  const clearPath = (basePath: string) => {
    try {
      Object.entries(module.FS.lookupPath(basePath).node.contents).forEach(([path, { isFolder }]) => {
        module.print(`Clearing ${basePath}/${path}`)
        isFolder
            ? clearPath(`${basePath}/${path}`)
            : module.FS.unlink(`${basePath}/${path}`)
      })
      module.FS.rmdir(`${basePath}`)
    } catch (err) { module.print(`Failed to remove stored data ${err}`) }
  };

  const removeData = () => {
    setOpenDeleteConfirmation(true);
  }

  const runInstance = () => {
    module.setDependencies(deps => ({ ...deps, [RunDependency.manualStart]: true }));
    module.removeRunDependency(RunDependency.manualStart);
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
            {dependencies[RunDependency.fsSync] && dependencies[RunDependency.data] && <Button
                sx={{ fontSize: '1em' }}
                variant="contained"
                disabled={!!instance}
                onClick={() => runInstance()}
            ><LaunchIcon width="2.4em" height="2.4em" style={{ margin: '0 1em 0 0' }} /> {t('menu.Run')}</Button>}
            {!instance && dependencies[RunDependency.fsSync] && !dependencies[RunDependency.data] && <Button
                sx={{ fontSize: '1em' }}
                variant="contained"
                disabled={!zipInput.current}
                onClick={() => zipInput.current?.click()}
            ><ZipIcon width="2.4em" height="2.4em" style={{ margin: '0 1em 0 0' }} /> {t('menu.Select zip archive')}</Button>}
            {!instance && dependencies[RunDependency.fsSync] && !dependencies[RunDependency.data] && <Button
              sx={{ fontSize: '1em' }}
              variant="contained"
              disabled={!directoryInput.current}
              onClick={() => directoryInput.current?.click()}
            ><UploadIcon width="2.4em" height="2.4em" style={{ margin: '0 1em 0 0' }} /> {t('menu.Select data folder')}</Button>}
            {!instance && dependencies[RunDependency.fsSync] && dependencies[RunDependency.data] && <Button
              sx={{ fontSize: '1em' }}
              variant="contained"
              onClick={() => removeData()}
            ><DeleteIcon width="2.4em" height="2.4em" style={{ margin: '0 1em 0 0' }} /> {t('menu.Remove data')}</Button>}
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
      {downloadProgress < 100 && <LinearProgress variant="determinate" value={downloadProgress} />}
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
          if (!status) return;

          clearPath(String(module.ENV.FHEROES2_DATA));
          module.FS.syncfs(false, err => {
            if (err) return module.print(`Failed to remove data at [${module.ENV.FHEROES2_DATA}]`);
            module.addRunDependency(RunDependency.data);
            setDependencies({ ...dependencies, [RunDependency.data]: false });
            setShowConsole(true)
          });

        }}
        color="error" />
    </Card>
  )
}
