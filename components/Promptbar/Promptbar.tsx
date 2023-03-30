import { Folder } from '@/types/folder';
import { Prompt } from '@/types/prompt';
import {
  IconArrowBarRight,
  IconFolderPlus,
  IconMistOff,
  IconPlus,
} from '@tabler/icons-react';
import { FC, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { PromptFolders } from '../Folders/Prompt/PromptFolders';
import { Search } from '../Sidebar/Search';
import { PromptbarSettings } from './PromptbarSettings';
import { Prompts } from './Prompts';

interface Props {
  prompts: Prompt[];
  folders: Folder[];
  onCreateFolder: (name: string) => void;
  onDeleteFolder: (folderId: string) => void;
  onUpdateFolder: (folderId: string, name: string) => void;
  onToggleSidebar: () => void;
  onCreatePrompt: () => void;
  onUpdatePrompt: (prompt: Prompt) => void;
  onDeletePrompt: (prompt: Prompt) => void;
}

export const Promptbar: FC<Props> = ({
  folders,
  prompts,
  onCreateFolder,
  onDeleteFolder,
  onUpdateFolder,
  onCreatePrompt,
  onUpdatePrompt,
  onDeletePrompt,
  onToggleSidebar,
}) => {
  const { t } = useTranslation('promptbar');
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [filteredPrompts, setFilteredPrompts] = useState<Prompt[]>(prompts);

  const handleUpdatePrompt = (prompt: Prompt) => {
    onUpdatePrompt(prompt);
    setSearchTerm('');
  };

  const handleDeletePrompt = (prompt: Prompt) => {
    onDeletePrompt(prompt);
    setSearchTerm('');
  };

  const handleDrop = (e: any) => {
    if (e.dataTransfer) {
      const prompt = JSON.parse(e.dataTransfer.getData('prompt'));

      const updatedPrompt = {
        ...prompt,
        folderId: e.target.dataset.folderId,
      };

      onUpdatePrompt(updatedPrompt);

      e.target.style.background = 'none';
    }
  };

  const allowDrop = (e: any) => {
    e.preventDefault();
  };

  const highlightDrop = (e: any) => {
    e.target.style.background = '#343541';
  };

  const removeHighlight = (e: any) => {
    e.target.style.background = 'none';
  };

  useEffect(() => {
    if (searchTerm) {
      setFilteredPrompts(
        prompts.filter((prompt) => {
          const searchable =
            prompt.name.toLowerCase() +
            ' ' +
            prompt.description.toLowerCase() +
            ' ' +
            prompt.content.toLowerCase();
          return searchable.includes(searchTerm.toLowerCase());
        }),
      );
    } else {
      setFilteredPrompts(prompts);
    }
  }, [searchTerm, prompts]);

  return (
    <div className="fixed top-0 right-0 z-50 flex h-full w-[260px] flex-col gap-2 bg-[#202123] p-2 transition-all sm:relative">
      <div className="flex gap-2 px-1">
        <button
          className="flex flex-grow items-center gap-3 rounded-md border border-white/20 p-3 text-[14px] leading-normal text-white transition-colors duration-200 hover:bg-gray-500/10"
          onClick={() => {
            onCreatePrompt();
            setSearchTerm('');
          }}
        >
          <IconPlus size={16} />
          {t('New prompt')}
        </button>

        <button
          className="flex items-center rounded-md border border-white/20 p-3 text-[14px] leading-normal text-white transition-colors duration-200 hover:bg-gray-500/10"
          onClick={() => onCreateFolder(t('New folder'))}
        >
          <IconFolderPlus size={18} />
        </button>
      </div>

      {prompts.length > 1 && (
          <Search
            placeholder={t('Search prompts...') || ''}
            searchTerm={searchTerm}
            onSearch={setSearchTerm}
          />
      )}

      <div className="flex-grow overflow-auto p-1">
        {folders.length > 0 && (
          <PromptFolders
            searchTerm={searchTerm}
            prompts={filteredPrompts}
            folders={folders}
            onUpdateFolder={onUpdateFolder}
            onDeleteFolder={onDeleteFolder}
            // prompt props
            onDeletePrompt={handleDeletePrompt}
            onUpdatePrompt={handleUpdatePrompt}
          />
        )}

        {prompts.length > 0 ? (
          <div
            onDrop={(e) => handleDrop(e)}
            onDragOver={allowDrop}
            onDragEnter={highlightDrop}
            onDragLeave={removeHighlight}
          >
            <Prompts
              prompts={filteredPrompts.filter((prompt) => !prompt.folderId)}
              onUpdatePrompt={handleUpdatePrompt}
              onDeletePrompt={handleDeletePrompt}
            />
          </div>
        ) : (
          <div className="mt-8 text-center text-white opacity-50 select-none">
            <IconMistOff />
            {t('No prompts.')}
          </div>
        )}
      </div>
      <div className="px-1">
        <PromptbarSettings />
      </div>
    </div>
  );
};
