import { Module, ModuleInitParams } from '../types/Module';

import mainScriptUrlOrBlob from '../assets/fheroes2/fheroes2.js?url'

import data from '../assets/fheroes2/fheroes2.data?url'
import wasm from '../assets/fheroes2/fheroes2.wasm?url'

import fheroes2 from '../assets/fheroes2/fheroes2';

export const ModuleInstance = ({ ENV, reportDownloadProgress, pushMessage, canvas }: ModuleInitParams) => {
  let module: Module;
  return fheroes2(module = <Module>{
    print: msg => module.printErr?.(msg),
    printErr: msg => pushMessage?.(msg),
    canvas,
    mainScriptUrlOrBlob: `${mainScriptUrlOrBlob}?pthread-worker`,
    preInit: [() => { Object.assign(module.ENV, ENV) }],
    preRun: [
      () => {
        module.addRunDependency('fs-sync')
        module.FS.mkdir(`${ENV.HOME}`);
        module.FS.mount(module.FS.filesystems.IDBFS, { root: '/' }, `${ENV.HOME}`);
        module.FS.syncfs(true, err => {
          if (err) throw err;
          module.removeRunDependency('fs-sync')
        });
      },
    ],
    noInitialRun: true,
    onExit: code => console.log('exit code: '+code),
    locateFile: (path: string) => {
      if (path.endsWith('data')) return data;
      if (path.endsWith('wasm')) return wasm;
      throw(`Unknown file[${path}] is requested by fheroes2.js module; known urls are: ${[wasm, data]}`);
    },
    setStatus: (status: string | {}) => {
      if (!status) return;
      if (typeof status === 'string') {
        pushMessage(status);
        const dlProgressRE = /(?<progress>\d+)\/(?<total>\d+)/ig;
        if (!dlProgressRE.test(status)) return;
        dlProgressRE.lastIndex = 0;
        const { groups: { progress, total } } = [...status.matchAll(dlProgressRE)][0] as unknown as { groups: { progress: number, total: number } };
        reportDownloadProgress?.(Math.round(progress / total * 100));
      }
    }
  });
}
