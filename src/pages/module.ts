import throwExpression from '../common/throwExpression';
import {Module, ModuleInitialized, ModuleInitParams, RunDependency} from '../types/Module';

import data from '../assets/fheroes2/fheroes2.data?url'
import wasm from '../assets/fheroes2/fheroes2.wasm?url'

import fheroes2 from '../assets/fheroes2/fheroes2';

const mod = () => {
  const { FS, ENV, addRunDependency, removeRunDependency } = module;
  if (!FS || !ENV || !addRunDependency || !removeRunDependency) throw('module runtime was not initialized');
  return { FS, ENV, addRunDependency, removeRunDependency }
}

let module: Module = {
  preInit: [],
  preRun: [
    () => {
      const { addRunDependency } = mod();
      addRunDependency(RunDependency.manualStart);
    },
    () => {
      const { FS, ENV, addRunDependency, removeRunDependency } = mod();
      addRunDependency(RunDependency.fsSync)
      FS.mkdir(`${ENV.HOME}`);
      FS.mount(FS.filesystems.IDBFS, { root: '/' }, `${ENV.HOME}`);
      FS.syncfs(true, (err) => {
        if (err) throw err;
        let resourcesPresent = false;
        module.print?.(`Looking up data in [${ENV.FHEROES2_DATA}]`)
        try {
          resourcesPresent = Object.keys(FS.lookupPath(`${ENV.FHEROES2_DATA}`).node.contents).length > 0;
        }
        catch (ignore) {
          FS.mkdir(`${ENV.FHEROES2_DATA}`);
          module.print?.('No local data found...')
          resourcesPresent = false;
        }
        finally {
          if (!resourcesPresent) {
            addRunDependency?.(RunDependency.data)
          }
          else {
            module.print?.(`Local data found we are ready to start...`)
          }
          module.setDependencies?.((deps) => ({
            ...deps,
            [RunDependency.fsSync]: true,
            [RunDependency.data]: resourcesPresent
          }))
          removeRunDependency(RunDependency.fsSync)
        }
      });
    },
  ],
  locateFile: (path: string) => {
    if (path.endsWith('data')) return data;
    if (path.endsWith('wasm')) return wasm;
    module.printErr?.(`Unknown file[${path}] is requested by fheroes2.js module; known urls are: ${[wasm, data]}`);
    throw('missing_file');
  },
  setStatus: (status: string | {}) => {
    if (!status) return;
    if (typeof status === 'string') {
      module.print?.(status);
      const dlProgressRE = /(?<progress>\d+)\/(?<total>\d+)/ig;
      if (!dlProgressRE.test(status)) return;
      dlProgressRE.lastIndex = 0;
      const { groups: { progress, total } } = [...status.matchAll(dlProgressRE)][0] as unknown as { groups: { progress: number, total: number } };
      module.reportDownloadProgress?.(Math.round(progress / total * 100));
    }
  },
  print: msg => module.printErr?.(msg),
  printErr: msg => module.pushMessage?.(msg),
}

export const ModuleInstance = ({ canvas, ENV: MOD_ENV, ...props }: ModuleInitParams): ModuleInitialized => {
  Object.defineProperty(module, 'canvas', {
    get: () => canvas ?? throwExpression('canvas not provided')
  });
  module.preInit?.push(() => Object.assign(module.ENV ?? {}, MOD_ENV));
  return <Required<Module> & { instance: ReturnType<typeof fheroes2> }>Object.assign(module, {
    ...props,
    MOD_ENV,
    instance: fheroes2(module)
  });
}
