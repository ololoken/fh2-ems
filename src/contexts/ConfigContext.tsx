import { createContext, ReactNode } from 'react';
import config from '../config';
import useLocalStorage from '../hooks/useLocalStorage';

export type I18n =  'en' | 'ru';

const initialState = {
  ...config,
  onChangeLocalization: (lang: I18n) => {},
  onChangeCredentials: (creds: string) => {}
};

const ConfigContext = createContext(initialState);

type ConfigProviderProps = {
  children: ReactNode;
};

function ConfigProvider({ children }: ConfigProviderProps) {
  const [config, setConfig] = useLocalStorage('verde$config', initialState);
  const onChangeCredentials = (creds: string) => {
    setConfig({
      ...config,
      creds
    });
  };

  const onChangeLocalization = (lang: I18n) => {
    setConfig({
      ...config,
      i18n: lang
    });
  };

  return (
    <ConfigContext.Provider
      value={{
        ...config,
        onChangeCredentials,
        onChangeLocalization
      }}
    >
      {children}
    </ConfigContext.Provider>
  );
}

export { ConfigProvider, ConfigContext };
