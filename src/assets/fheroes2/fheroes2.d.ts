import { Module } from '../../types/Module';

export = fheroes2;
declare function fheroes2(moduleArg?: Partial<Module>): Promise<Module>;
declare namespace fheroes2 {
    export { fheroes2 as default };
}
