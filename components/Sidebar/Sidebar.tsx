import { IconFolderPlus, IconMistOff, IconPlus } from '@tabler/icons-react';
import { ReactNode, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import {
  CloseSidebarButton,
  OpenSidebarButton,
} from './components/OpenCloseButton';
import { SidebarToggleButton } from './components/SidebarToggleButton';

import Search from '../Search';

interface Props<T> {
  isOpen: boolean;
  addItemButtonTitle: string;
  side: 'left' | 'right';
  items: T[];
  itemComponent: ReactNode;
  folderComponent: ReactNode;
  footerComponent?: ReactNode;
  searchTerm: string;
  handleSearchTerm: (searchTerm: string) => void;
  toggleOpen: () => void;
  handleCreateItem: () => void;
  handleCreateFolder: () => void;
  handleDrop: (e: any) => void;
}

const Sidebar = <T,>({
  isOpen,
  addItemButtonTitle,
  side,
  items,
  itemComponent,
  folderComponent,
  footerComponent,
  searchTerm,
  handleSearchTerm,
  toggleOpen,
  handleCreateItem,
  handleCreateFolder,
  handleDrop,
}: Props<T>) => {
  const { t } = useTranslation('promptbar');

  const allowDrop = (e: any) => {
    e.preventDefault();
  };

  const highlightDrop = (e: any) => {
    e.target.style.background = '#343541';
  };

  const removeHighlight = (e: any) => {
    e.target.style.background = 'none';
  };

  return (
    <div
      className={`${isOpen ? 'w-[260px]' : 'w-0'} ${
        side === 'left' ? 'mobile:left-0' : 'mobile:right-0'
      } transition-all h-full ease-linear relative box-content mobile:fixed mobile:z-10`}
    >
      <div
        className={`${
          isOpen ? 'mobile:visible bg-[#202123]/90' : ''
        } fixed invisible left-0 w-full h-full bg-transparent transition-all ease-linear`}
        onClick={toggleOpen}
      ></div>
      <div
        className={`${side === 'left' && !isOpen ? '-translate-x-full' : ''} ${
          side === 'right' && !isOpen ? 'translate-x-full' : ''
        } absolute z-10 top-0 ${
          side === 'left' ? 'right' : 'left'
        }-0 flex transition-all ease-linear w-[260px] h-full flex-none flex-col p-2 space-y-2 bg-[#202123] text-[14px]`}
      >
        <div className="flex items-center">
          <button
            className="text-sidebar flex w-[190px] flex-shrink-0 cursor-pointer select-none items-center gap-3 rounded-md border border-white/20 p-3 text-white transition-colors duration-200 hover:bg-gray-500/10"
            onClick={() => {
              handleCreateItem();
              handleSearchTerm('');
            }}
          >
            <IconPlus size={16} />
            {addItemButtonTitle}
          </button>

          <button
            className="ml-2 flex flex-shrink-0 cursor-pointer items-center gap-3 rounded-md border border-white/20 p-3 text-sm text-white transition-colors duration-200 hover:bg-gray-500/10"
            onClick={handleCreateFolder}
          >
            <IconFolderPlus size={16} />
          </button>
        </div>
        {items?.length > 0 && (
          <Search
            placeholder={t('Search prompts...') || ''}
            searchTerm={searchTerm}
            onSearch={handleSearchTerm}
          />
        )}

        <div className="flex-grow overflow-auto resize-y">
          {items?.length > 0 && (
            <div className="flex border-b border-white/20 pb-2">
              {folderComponent}
            </div>
          )}

          {items?.length > 0 ? (
            <div
              className="pt-2"
              onDrop={handleDrop}
              onDragOver={allowDrop}
              onDragEnter={highlightDrop}
              onDragLeave={removeHighlight}
            >
              {itemComponent}
            </div>
          ) : (
            <div className="mt-8 select-none text-center text-white opacity-50">
              <IconMistOff className="sm:hidden mx-auto mb-3" />
              <span className="text-[14px] leading-normal">
                {t('No prompts.')}
              </span>
            </div>
          )}
        </div>
        {footerComponent}
      </div>

      <SidebarToggleButton onClick={toggleOpen} side={side} />
    </div>
  );
};

export default Sidebar;
