import React, {useEffect, useRef} from 'react';
import {Keyboard, Pressable, View} from 'react-native';
import {observer} from 'mobx-react';
import {Text as PaperText} from 'react-native-paper';
import BottomSheet, {
  BottomSheetFlatList,
  BottomSheetFlatListMethods,
} from '@gorhom/bottom-sheet';

import {useTheme} from '../../hooks';
import {createStyles} from './styles';
import {modelStore} from '../../store';
import {CustomBackdrop} from '../Sheet/CustomBackdrop';
import {getModelSkills, Model} from '../../utils';
import {SkillsDisplay} from '../SkillsDisplay';

type Props = {
  isVisible: boolean;
  chatInputHeight: number;
  onClose: () => void;
  onModelSelect?: (modelId: string) => void;
};

const ObservedSkillsDisplay = observer(({model}: {model: Model}) => (
  <SkillsDisplay
    model={model}
    hasProjectionModelWarning={false}
    onVisionPress={() => undefined}
    onProjectionWarningPress={() => undefined}
    visionEnabled={false}
  />
));

export const ChatPalModelPickerSheet = observer(
  ({isVisible, onClose, onModelSelect, chatInputHeight}: Props) => {
    const theme = useTheme();
    const styles = createStyles({theme});
    const bottomSheetRef = useRef<BottomSheet>(null);
    const flatListRef = useRef<BottomSheetFlatListMethods>(null);

    useEffect(() => {
      if (isVisible) Keyboard.dismiss();
    }, [isVisible]);

    useEffect(() => {
      const listener = Keyboard.addListener('keyboardDidShow', () => {
        if (isVisible) onClose();
      });
      return () => listener.remove();
    }, [isVisible, onClose]);

    const handleModelSelect = async (model: Model) => {
      try {
        onModelSelect?.(model.id);
        onClose();
        await modelStore.selectModel(model);
      } catch (error) {
        console.warn('Unable to select model', error);
      }
    };

    const renderModelItem = ({item}: {item: Model}) => {
      const isActiveModel = item.id === modelStore.activeModelId;
      const modelSkills = getModelSkills(item)
        .flatMap(skill => skill.labelKey)
        .join(', ');
      return (
        <Pressable
          key={item.id}
          style={[styles.listItem, isActiveModel && styles.activeListItem]}
          onPress={() => handleModelSelect(item)}>
          <View style={styles.itemContent}>
            <PaperText
              style={[
                styles.itemTitle,
                isActiveModel && styles.activeItemTitle,
              ]}>
              {item.name}
            </PaperText>
            {modelSkills ? <ObservedSkillsDisplay model={item} /> : null}
          </View>
        </Pressable>
      );
    };

    return (
      <BottomSheet
        ref={bottomSheetRef}
        onClose={onClose}
        enablePanDownToClose
        snapPoints={['70%']}
        enableDynamicSizing={false}
        backdropComponent={isVisible ? CustomBackdrop : undefined}
        backgroundStyle={{backgroundColor: theme.colors.background}}
        handleIndicatorStyle={{backgroundColor: theme.colors.primary}}
        enableContentPanningGesture={false}
        enableHandlePanningGesture
        accessible={false}>
        <View style={{paddingHorizontal: 16, paddingBottom: 8}}>
          <PaperText variant="titleMedium">Select a local model</PaperText>
        </View>
        <BottomSheetFlatList
          ref={flatListRef}
          data={modelStore.availableModels}
          renderItem={renderModelItem}
          keyExtractor={item => item.id}
          contentContainerStyle={{paddingBottom: chatInputHeight + 66}}
          bounces={false}
          showsVerticalScrollIndicator={false}
        />
      </BottomSheet>
    );
  },
);
