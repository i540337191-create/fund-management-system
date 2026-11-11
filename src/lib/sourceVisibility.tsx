import {createContext,useContext} from 'react';
export const SourceVisibilityContext=createContext(false);
export const useHideSeedDemo=()=>useContext(SourceVisibilityContext);
