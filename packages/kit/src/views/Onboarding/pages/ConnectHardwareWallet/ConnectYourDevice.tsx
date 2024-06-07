import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { useIntl } from 'react-intl';
import {
  Linking,
  PermissionsAndroid,
  Platform,
  StyleSheet,
} from 'react-native';

import type { IButtonProps } from '@onekeyhq/components';
import {
  Anchor,
  Button,
  Dialog,
  Divider,
  Heading,
  LottieView,
  Page,
  ScrollView,
  SegmentControl,
  SizableText,
  Stack,
  Toast,
  XStack,
  YStack,
} from '@onekeyhq/components';
import { HeaderIconButton } from '@onekeyhq/components/src/layouts/Navigation/Header';
import ConnectByBluetoothAnim from '@onekeyhq/kit/assets/animations/connect_by_bluetooth.json';
import ConnectByUSBAnim from '@onekeyhq/kit/assets/animations/connect_by_usb.json';
import backgroundApiProxy from '@onekeyhq/kit/src/background/instance/backgroundApiProxy';
import { AccountSelectorProviderMirror } from '@onekeyhq/kit/src/components/AccountSelector';
import { useCreateQrWallet } from '@onekeyhq/kit/src/components/AccountSelector/hooks/useAccountSelectorCreateAddress';
import { DeviceAvatar } from '@onekeyhq/kit/src/components/DeviceAvatar';
import { ListItem } from '@onekeyhq/kit/src/components/ListItem';
import useAppNavigation from '@onekeyhq/kit/src/hooks/useAppNavigation';
import { useHelpLink } from '@onekeyhq/kit/src/hooks/useHelpLink';
import { useAccountSelectorActions } from '@onekeyhq/kit/src/states/jotai/contexts/accountSelector';
import uiDeviceUtils from '@onekeyhq/kit/src/utils/uiDeviceUtils';
import { HARDWARE_BRIDGE_DOWNLOAD_URL } from '@onekeyhq/shared/src/config/appConfig';
import {
  BleLocationServiceError,
  BridgeTimeoutError,
  BridgeTimeoutErrorForDesktop,
  ConnectTimeoutError,
  DeviceMethodCallTimeout,
  InitIframeLoadFail,
  InitIframeTimeout,
  NeedBluetoothPermissions,
  NeedBluetoothTurnedOn,
  NeedOneKeyBridge,
} from '@onekeyhq/shared/src/errors/errors/hardwareErrors';
import { convertDeviceError } from '@onekeyhq/shared/src/errors/utils/deviceErrorUtils';
import { ETranslations } from '@onekeyhq/shared/src/locale';
import {
  PERMISSIONS,
  RESULTS,
  check,
  openSettings,
  requestMultiple,
} from '@onekeyhq/shared/src/modules3rdParty/react-native-permissions';
import platformEnv from '@onekeyhq/shared/src/platformEnv';
import { EOnboardingPages } from '@onekeyhq/shared/src/routes';
import { HwWalletAvatarImages } from '@onekeyhq/shared/src/utils/avatarUtils';
import deviceUtils from '@onekeyhq/shared/src/utils/deviceUtils';
import timerUtils from '@onekeyhq/shared/src/utils/timerUtils';
import { EAccountSelectorSceneName } from '@onekeyhq/shared/types';
import {
  EOneKeyDeviceMode,
  type IOneKeyDeviceFeatures,
} from '@onekeyhq/shared/types/device';

import { useFirmwareUpdateActions } from '../../../FirmwareUpdate/hooks/useFirmwareUpdateActions';
import useScanQrCode from '../../../ScanQrCode/hooks/useScanQrCode';

import { useFirmwareVerifyDialog } from './FirmwareVerifyDialog';

import type { IDeviceType, SearchDevice } from '@onekeyfe/hd-core';
import type { ImageSourcePropType } from 'react-native';

type IConnectYourDeviceItem = {
  title: string;
  src: ImageSourcePropType;
  onPress: () => void | Promise<void>;
  opacity?: number;
  device: SearchDevice | undefined;
};

const headerRight = (onPress: () => void) => (
  <HeaderIconButton icon="QuestionmarkOutline" onPress={onPress} />
);

function DeviceListItem({ item }: { item: IConnectYourDeviceItem }) {
  const [isLoading, setIsLoading] = useState(false);
  return (
    <ListItem
      opacity={item.opacity ?? 0.5}
      avatarProps={{
        source: item.src,
      }}
      title={item.title}
      drillIn
      isLoading={isLoading}
      // TODO add loading for onPress
      onPress={async () => {
        try {
          setIsLoading(true);
          await item.onPress();
        } finally {
          setIsLoading(false);
        }
      }}
    />
  );
}

function ConnectByQrCode() {
  const {
    start: startScan,
    // close,
  } = useScanQrCode();
  const actions = useAccountSelectorActions();
  const navigation = useAppNavigation();
  const { createQrWallet } = useCreateQrWallet();
  const intl = useIntl();

  return (
    <Stack flex={1} alignItems="center" justifyContent="center">
      <DeviceAvatar deviceType="pro" size={40} />
      <SizableText textAlign="center" size="$bodyLgMedium" pt="$5" pb="$2">
        {intl.formatMessage({
          id: ETranslations.onboarding_create_qr_wallet_title,
        })}
      </SizableText>
      <SizableText
        textAlign="center"
        color="$textSubdued"
        maxWidth="$80"
        pb="$5"
      >
        {intl.formatMessage({
          id: ETranslations.onboarding_create_qr_wallet_desc,
        })}
      </SizableText>
      <Button
        variant="primary"
        $md={
          {
            size: 'large',
          } as IButtonProps
        }
        onPress={async () => {
          try {
            await createQrWallet({ isOnboarding: true });
          } catch (error) {
            navigation.pop();
            throw error;
          }
        }}
      >
        {intl.formatMessage({ id: ETranslations.global_scan_to_connect })}
      </Button>
    </Stack>
  );
}

enum EConnectionStatus {
  init = 'init',
  searching = 'searching',
  listing = 'listing',
}
function ConnectByUSBOrBLE({
  toOneKeyHardwareWalletPage,
}: {
  toOneKeyHardwareWalletPage: () => void;
}) {
  const intl = useIntl();
  const searchStateRef = useRef<'start' | 'stop'>('stop');
  const [connectStatus, setConnectStatus] = useState(EConnectionStatus.init);

  const actions = useAccountSelectorActions();

  const { showFirmwareVerifyDialog } = useFirmwareVerifyDialog();
  const fwUpdateActions = useFirmwareUpdateActions();
  const navigation = useAppNavigation();

  const createHwWallet = useCallback(
    async ({
      device,
      isFirmwareVerified,
      features,
    }: {
      device: SearchDevice;
      isFirmwareVerified?: boolean;
      features: IOneKeyDeviceFeatures;
    }) => {
      try {
        console.log('ConnectYourDevice -> createHwWallet', device);

        navigation.push(EOnboardingPages.FinalizeWalletSetup);

        await Promise.all([
          await actions.current.createHWWalletWithHidden({
            device,
            // device checking loading is not need for onboarding, use FinalizeWalletSetup instead
            hideCheckingDeviceLoading: true,
            skipDeviceCancel: true, // createHWWalletWithHidden: skip device cancel as create may call device multiple times
            features,
            isFirmwareVerified,
          }),
        ]);
      } catch (error) {
        navigation.pop();
        throw error;
      } finally {
        await backgroundApiProxy.serviceHardwareUI.closeHardwareUiStateDialog({
          connectId: device.connectId || '',
        });
      }
    },
    [actions, navigation],
  );

  const handleSetupNewWalletPress = useCallback(
    ({ deviceType }: { deviceType: IDeviceType }) => {
      navigation.push(EOnboardingPages.ActivateDevice, {
        tutorialType: 'create',
        deviceType,
      });
    },
    [navigation],
  );

  const handleRestoreWalletPress = useCallback(
    ({ deviceType }: { deviceType: IDeviceType }) => {
      navigation.push(EOnboardingPages.ActivateDevice, {
        tutorialType: 'restore',
        deviceType,
      });
    },
    [navigation],
  );

  const requestsUrl = useHelpLink({ path: 'requests/new' });

  const handleNotActivatedDevicePress = useCallback(
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    ({ deviceType }: { deviceType: IDeviceType }) => {
      const dialog = Dialog.show({
        icon: 'WalletCryptoOutline',
        title: intl.formatMessage({
          id: ETranslations.onboarding_activate_device,
        }),
        description: intl.formatMessage({
          id: ETranslations.onboarding_activate_device_help_text,
        }),
        dismissOnOverlayPress: false,
        renderContent: (
          <Stack>
            <ListItem
              alignItems="flex-start"
              icon="PlusCircleOutline"
              title={intl.formatMessage({
                id: ETranslations.onboarding_activate_device_by_set_up_new_wallet,
              })}
              subtitle={intl.formatMessage({
                id: ETranslations.onboarding_activate_device_by_set_up_new_wallet_help_text,
              })}
              drillIn
              onPress={async () => {
                await dialog.close();
                handleSetupNewWalletPress({ deviceType });
              }}
              borderWidth={StyleSheet.hairlineWidth}
              borderColor="$borderSubdued"
              m="$0"
              py="$2.5"
              bg="$bgSubdued"
            />
            <ListItem
              alignItems="flex-start"
              icon="ArrowBottomCircleOutline"
              title={intl.formatMessage({
                id: ETranslations.onboarding_activate_device_by_restore,
              })}
              subtitle={intl.formatMessage({
                id: ETranslations.onboarding_activate_device_by_restore_help_text,
              })}
              drillIn
              onPress={async () => {
                await dialog.close();
                const packageAlertDialog = Dialog.show({
                  tone: 'warning',
                  icon: 'PackageDeliveryOutline',
                  title: intl.formatMessage({
                    id: ETranslations.onboarding_activate_device_by_restore_warning,
                  }),
                  dismissOnOverlayPress: false,
                  description: intl.formatMessage({
                    id: ETranslations.onboarding_activate_device_by_restore_warning_help_text,
                  }),
                  showFooter: false,
                  renderContent: (
                    <XStack space="$2.5">
                      <Button
                        flex={1}
                        size="large"
                        $gtMd={{ size: 'medium' } as IButtonProps}
                        onPress={() => Linking.openURL(requestsUrl)}
                      >
                        {intl.formatMessage({
                          id: ETranslations.global_contact_us,
                        })}
                      </Button>
                      <Button
                        flex={1}
                        variant="primary"
                        size="large"
                        $gtMd={{ size: 'medium' } as IButtonProps}
                        onPress={async () => {
                          await packageAlertDialog.close();
                          handleRestoreWalletPress({ deviceType });
                        }}
                      >
                        {intl.formatMessage({
                          id: ETranslations.global_continue,
                        })}
                      </Button>
                    </XStack>
                  ),
                });
              }}
              borderWidth={StyleSheet.hairlineWidth}
              borderColor="$borderSubdued"
              m="$0"
              mt="$2.5"
              py="$2.5"
              bg="$bgSubdued"
            />
          </Stack>
        ),
        showFooter: false,
      });
    },
    [handleRestoreWalletPress, handleSetupNewWalletPress, intl, requestsUrl],
  );

  const handleHwWalletCreateFlow = useCallback(
    async ({ device }: { device: SearchDevice }) => {
      const handleBootloaderMode = () => {
        Toast.error({
          title: 'Device is in bootloader mode',
        });
        fwUpdateActions.showBootloaderMode({
          connectId: device.connectId ?? undefined,
        });
        console.log('Device is in bootloader mode', device);
        throw new Error('Device is in bootloader mode');
      };
      if (
        await deviceUtils.isBootloaderModeFromSearchDevice({
          device: device as any,
        })
      ) {
        handleBootloaderMode();
        return;
      }

      const features = await backgroundApiProxy.serviceHardware.connect({
        device,
      });

      if (!features) {
        throw new Error('connect device failed, no features returned');
      }

      if (await deviceUtils.isBootloaderModeByFeatures({ features })) {
        handleBootloaderMode();
        return;
      }

      let deviceType = await deviceUtils.getDeviceTypeFromFeatures({
        features,
      });
      if (deviceType === 'unknown') {
        deviceType = device.deviceType || deviceType;
      }

      const deviceMode = await deviceUtils.getDeviceModeFromFeatures({
        features,
      });
      // const deviceMode = EOneKeyDeviceMode.notInitialized;
      if (deviceMode === EOneKeyDeviceMode.backupMode) {
        Toast.error({
          title: 'Device is in backup mode',
        });
        return;
      }

      if (
        await backgroundApiProxy.serviceHardware.shouldAuthenticateFirmware({
          device,
        })
      ) {
        await showFirmwareVerifyDialog({
          device,
          onContinue: async ({ checked }) => {
            if (deviceMode === EOneKeyDeviceMode.notInitialized) {
              handleNotActivatedDevicePress({ deviceType });
              return;
            }

            await createHwWallet({
              device,
              isFirmwareVerified: checked,
              features,
            });
          },
        });
        return;
      }

      if (deviceMode === EOneKeyDeviceMode.notInitialized) {
        handleNotActivatedDevicePress({ deviceType });
        return;
      }

      await createHwWallet({ device, features });
    },
    [
      createHwWallet,
      fwUpdateActions,
      handleNotActivatedDevicePress,
      showFirmwareVerifyDialog,
    ],
  );

  const checkBLEPermission = useCallback(async () => {
    if (platformEnv.isNativeIOS) {
      const status = await check(PERMISSIONS.IOS.BLUETOOTH);
      return status === RESULTS.GRANTED;
    }

    if (platformEnv.isNativeAndroid) {
      if ((Platform.Version as number) < 31) {
        const status = await PermissionsAndroid.request(
          PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
        );
        return status === RESULTS.GRANTED;
      }
      const permissions = [
        PERMISSIONS.ANDROID.BLUETOOTH_CONNECT,
        PERMISSIONS.ANDROID.BLUETOOTH_SCAN,
      ];
      const statuses = await requestMultiple(permissions);
      return (
        statuses[PERMISSIONS.ANDROID.BLUETOOTH_CONNECT] === RESULTS.GRANTED &&
        statuses[PERMISSIONS.ANDROID.BLUETOOTH_SCAN] === RESULTS.GRANTED
      );
    }
  }, []);

  const [isSearching, setIsSearching] = useState(false);
  const [isChecking, setIsChecking] = useState(false);
  const [searchedDevices, setSearchedDevices] = useState<SearchDevice[]>([]);

  const devicesData = useMemo<IConnectYourDeviceItem[]>(
    () => [
      /*
      navigation.replace(RootRoutes.Onboarding, {
          screen: EOnboardingRoutes.BehindTheScene,
          params: {
            password: '',
            mnemonic: '',
            isHardwareCreating: {
              device,
              features,
            },
            entry,
          },
        });
      serviceAccount.createHWWallet
      */
      ...searchedDevices.map((item) => ({
        title: item.name,
        src: HwWalletAvatarImages[item.deviceType],
        device: item,
        onPress: () => handleHwWalletCreateFlow({ device: item }),
        opacity: 1,
      })),
      ...(process.env.NODE_ENV !== 'production'
        ? [
            {
              title: 'OneKey Classic 1S(Activate Your Device -- ActionSheet)',
              src: HwWalletAvatarImages.classic1s,
              onPress: () =>
                handleNotActivatedDevicePress({ deviceType: 'classic' }),
              device: undefined,
            },
            {
              title: 'OneKey Pro(Activate Your Device)',
              src: HwWalletAvatarImages.pro,
              onPress: () =>
                handleSetupNewWalletPress({ deviceType: 'classic' }),
              device: undefined,
            },
            {
              title: 'OneKey Touch2(buy)',
              src: HwWalletAvatarImages.touch,
              onPress: toOneKeyHardwareWalletPage,
              device: undefined,
            },
          ]
        : []),
    ],
    [
      handleHwWalletCreateFlow,
      handleNotActivatedDevicePress,
      handleSetupNewWalletPress,
      searchedDevices,
      toOneKeyHardwareWalletPage,
    ],
  );

  const scanDevice = useCallback(() => {
    const deviceScanner = deviceUtils.getDeviceScanner({
      backgroundApi: backgroundApiProxy,
    });
    deviceScanner.startDeviceScan(
      (response) => {
        if (!response.success) {
          const error = convertDeviceError(response.payload);
          if (platformEnv.isNative) {
            if (
              !(error instanceof NeedBluetoothTurnedOn) &&
              !(error instanceof NeedBluetoothPermissions) &&
              !(error instanceof BleLocationServiceError)
            ) {
              Toast.error({
                title: error.message || 'DeviceScanError',
              });
            } else {
              deviceScanner.stopScan();
            }
          } else if (
            error instanceof InitIframeLoadFail ||
            error instanceof InitIframeTimeout
          ) {
            Toast.error({
              title: intl.formatMessage({
                id: ETranslations.global_network_error,
              }),
              // error.message i18n should set InitIframeLoadFail.defaultKey, InitIframeTimeout.defaultKey
              message: error.message || 'DeviceScanError',
              // message: "Check your connection and retry",
            });
            deviceScanner.stopScan();
          }

          if (
            error instanceof BridgeTimeoutError ||
            error instanceof BridgeTimeoutErrorForDesktop
          ) {
            Toast.error({
              title: intl.formatMessage({
                id: ETranslations.global_connection_failed,
              }),
              // error.message i18n should set BridgeTimeoutError.defaultKey...
              message: error.message || 'DeviceScanError',
              // message: "Please reconnect the USB and try again", // USB only
            });
            deviceScanner.stopScan();
          }

          if (
            error instanceof ConnectTimeoutError ||
            error instanceof DeviceMethodCallTimeout
          ) {
            Toast.error({
              title: intl.formatMessage({
                id: ETranslations.global_connection_failed,
              }),
              // error.message i18n should set ConnectTimeoutError.defaultKey...
              message: error.message || 'DeviceScanError',
              // message: "Please reconnect device and try again", // USB or BLE
            });
            deviceScanner.stopScan();
          }

          if (error instanceof NeedOneKeyBridge) {
            Dialog.confirm({
              icon: 'OnekeyBrand',
              title: intl.formatMessage({
                id: ETranslations.onboarding_install_onekey_bridge,
              }),
              // error.message i18n should set NeedOneKeyBridge.defaultKey...
              description:
                error.message ||
                'OneKey Bridge facilitates seamless communication between OneKey and your browser for a better experience.',
              onConfirmText: intl.formatMessage({
                id: ETranslations.global_download_and_install,
              }),
              onConfirm: () => Linking.openURL(HARDWARE_BRIDGE_DOWNLOAD_URL),
            });

            deviceScanner.stopScan();
          }

          setIsSearching(false);
          return;
        }

        setSearchedDevices(response.payload);
        console.log('startDeviceScan>>>>>', response.payload);
      },
      (state) => {
        searchStateRef.current = state;
      },
    );
  }, [intl]);

  const checkBLEState = useCallback(async () => {
    // hack missing getBleManager.
    await uiDeviceUtils.getBleManager();
    await timerUtils.wait(100);
    const bleManager = await uiDeviceUtils.getBleManager();
    const checkState = await bleManager?.checkState();
    return checkState === 'on';
  }, []);

  const listingDevice = useCallback(() => {
    setConnectStatus(EConnectionStatus.listing);
    scanDevice();
  }, [scanDevice]);

  const startBLEConnection = useCallback(async () => {
    setIsChecking(true);
    const isGranted = await checkBLEPermission();
    if (!isGranted) {
      Dialog.confirm({
        icon: 'BluetoothOutline',
        title: intl.formatMessage({
          id: ETranslations.onboarding_bluetooth_permission_needed,
        }),
        description: intl.formatMessage({
          id: ETranslations.onboarding_bluetooth_permission_needed_help_text,
        }),
        onConfirmText: intl.formatMessage({
          id: ETranslations.global_go_to_settings,
        }),
        onConfirm: openSettings,
        onClose: () => setIsChecking(false),
      });
      return;
    }

    const checkState = await checkBLEState();
    if (!checkState) {
      Dialog.confirm({
        icon: 'BluetoothOutline',
        title: intl.formatMessage({
          id: ETranslations.onboarding_enable_bluetooth,
        }),
        description: intl.formatMessage({
          id: ETranslations.onboarding_enable_bluetooth_help_text,
        }),
        onConfirmText: intl.formatMessage({
          id: ETranslations.global_go_to_settings,
        }),
        onConfirm: () =>
          platformEnv.isNativeIOS
            ? Linking.openURL('App-Prefs:Bluetooth')
            : Linking.sendIntent('android.settings.BLUETOOTH_SETTINGS'),
        onClose: () => setIsChecking(false),
      });
      return;
    }

    setIsChecking(false);
    listingDevice();
  }, [checkBLEPermission, checkBLEState, intl, listingDevice]);

  useEffect(() => {
    if (!platformEnv.isNative) {
      listingDevice();
    }
  }, [listingDevice]);

  return (
    <>
      <Stack alignItems="center" bg="$bgSubdued">
        <LottieView
          width="100%"
          height="$56"
          source={
            platformEnv.isNative ? ConnectByBluetoothAnim : ConnectByUSBAnim
          }
        />
      </Stack>

      {connectStatus === EConnectionStatus.init ? (
        <YStack pt="$8">
          <Heading size="$headingMd" textAlign="center">
            {intl.formatMessage({
              id: ETranslations.onboarding_bluetooth_prepare_to_connect,
            })}
          </Heading>
          <SizableText
            pt="$2"
            pb="$5"
            color="$textSubdued"
            textAlign="center"
            maxWidth="$80"
            mx="auto"
          >
            {intl.formatMessage({
              id: ETranslations.onboarding_bluetooth_prepare_to_connect_help_text,
            })}
          </SizableText>
          <Button
            mx="auto"
            size="large"
            variant="primary"
            loading={isChecking}
            onPress={startBLEConnection}
          >
            {intl.formatMessage({ id: ETranslations.global_start_connection })}
          </Button>
        </YStack>
      ) : null}

      {connectStatus === EConnectionStatus.listing ? (
        <ScrollView flex={1}>
          <SizableText
            textAlign="center"
            color="$textSubdued"
            pt="$2.5"
            pb="$5"
          >
            {platformEnv.isNative
              ? `${intl.formatMessage({
                  id: ETranslations.onboarding_bluetooth_connect_help_text,
                })}...`
              : intl.formatMessage({
                  id: ETranslations.onboarding_usb_connect_help_text,
                })}
          </SizableText>
          {devicesData.map((item, index) => (
            <DeviceListItem item={item} key={index} />
          ))}
          {platformEnv.isDev ? (
            <Button
              onPress={() => {
                void fwUpdateActions.showForceUpdate({
                  connectId: undefined,
                });
              }}
            >
              ForceUpdate
            </Button>
          ) : null}
        </ScrollView>
      ) : null}
    </>
  );
}
enum EConnectDeviceTab {
  usbOrBle = 'usbOrBle',
  qr = 'qr',
}
export function ConnectYourDevicePage() {
  const navigation = useAppNavigation();
  const intl = useIntl();

  const [tabValue, setTabValue] = useState<EConnectDeviceTab>(
    EConnectDeviceTab.usbOrBle,
  );

  const toOneKeyHardwareWalletPage = useCallback(() => {
    navigation.push(EOnboardingPages.OneKeyHardwareWallet);
  }, [navigation]);

  return (
    <Page>
      <Page.Header
        title={intl.formatMessage({
          id: ETranslations.onboarding_connect_your_device,
        })}
        headerRight={() => headerRight(toOneKeyHardwareWalletPage)}
      />
      <Page.Body>
        <Stack px="$5" pt="$2" pb="$4">
          <SegmentControl
            fullWidth
            value={tabValue}
            onChange={(v) => setTabValue(v as any)}
            options={[
              {
                label: platformEnv.isNative
                  ? intl.formatMessage({ id: ETranslations.global_bluetooth })
                  : 'USB',
                value: EConnectDeviceTab.usbOrBle,
              },
              {
                label: intl.formatMessage({ id: ETranslations.global_qr_code }),
                value: EConnectDeviceTab.qr,
              },
            ]}
          />
        </Stack>
        <Divider />

        {tabValue === EConnectDeviceTab.usbOrBle ? (
          <ConnectByUSBOrBLE
            toOneKeyHardwareWalletPage={toOneKeyHardwareWalletPage}
          />
        ) : null}

        {tabValue === EConnectDeviceTab.qr ? <ConnectByQrCode /> : null}

        {/* buy link */}
        <XStack
          px="$5"
          py="$0.5"
          mt="auto"
          justifyContent="center"
          alignItems="center"
        >
          <SizableText size="$bodyMd" color="$textSubdued">
            {intl.formatMessage({
              // eslint-disable-next-line spellcheck/spell-checker
              id: ETranslations.global_onekey_prompt_dont_have_yet,
            })}
          </SizableText>
          <Anchor
            display="flex"
            color="$textInteractive"
            hoverStyle={{
              color: '$textInteractiveHover',
            }}
            href="https://shop.onekey.so/"
            target="_blank"
            size="$bodyMdMedium"
            p="$2"
          >
            {intl.formatMessage({ id: ETranslations.global_buy_one })}
          </Anchor>
        </XStack>
      </Page.Body>
    </Page>
  );
}

export function ConnectYourDevice() {
  return (
    <AccountSelectorProviderMirror
      enabledNum={[0]}
      config={{
        sceneName: EAccountSelectorSceneName.home, // TODO read from router
      }}
    >
      <ConnectYourDevicePage />
    </AccountSelectorProviderMirror>
  );
}
export default ConnectYourDevice;
