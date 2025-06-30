import {
    Direction,
    QBoxLayout,
    QCheckBox,
    QComboBox,
    QGridLayout,
    QGroupBox,
    QIcon,
    QLabel,
    QLineEdit,
    QMainWindow,
    QPushButton,
    QScrollArea,
    QSpinBox,
    QTabWidget,
    QTextEdit,
    QWidget
} from '@nodegui/nodegui';
import ModbusRTU, { ServerTCP } from 'modbus-serial';
import sourceMapSupport from 'source-map-support';

sourceMapSupport.install();

interface ModbusConfig {
    type: 'TCP' | 'RTU';
    host?: string;
    port?: number;
    baudRate?: number;
    dataBits?: number;
    stopBits?: number;
    parity?: 'none' | 'even' | 'odd' | 'mark' | 'space';
    serialPort?: string;
}


class ModbusTestApp {
    private win: QMainWindow;
    private client: ModbusRTU;
    private modbusServer: ServerTCP | null = null;
    private isConnected = false;
    private connectionCheckTimer: NodeJS.Timeout | null = null;
    private config: ModbusConfig = {
        type: 'TCP',
        host: '127.0.0.1',
        port: 502
    };

    constructor() {
        this.client = new ModbusRTU();
        this.win = new QMainWindow();
        this.setupUI();
    }

    private setupUI(): void {
        this.win.setWindowTitle("Modbus测试工具");
        this.win.resize(1000, 700);

        const centralWidget = new QWidget();
        const mainLayout = new QBoxLayout(Direction.TopToBottom);
        centralWidget.setLayout(mainLayout);

        // 创建标签页
        const tabWidget = new QTabWidget();

        // 连接配置标签页
        const connectionTab = this.createConnectionTab();
        tabWidget.addTab(connectionTab, new QIcon(), "连接配置");

        // 主站功能标签页
        const masterTab = this.createMasterTab();
        tabWidget.addTab(masterTab, new QIcon(), "主站功能");

        // 从站功能标签页
        const slaveTab = this.createSlaveTab();
        tabWidget.addTab(slaveTab, new QIcon(), "从站功能");

        mainLayout.addWidget(tabWidget);
        this.win.setCentralWidget(centralWidget);

        this.win.setStyleSheet(`
      QMainWindow {
        background-color: #f0f0f0;
      }
      QGroupBox {
        font-weight: bold;
        border: 2px solid #cccccc;
        border-radius: 5px;
        margin-top: 1ex;
        padding-top: 10px;
      }
      QGroupBox::title {
        subcontrol-origin: margin;
        left: 10px;
        padding: 0 5px 0 5px;
      }
      QPushButton {
        background-color: #4CAF50;
        border: none;
        color: white;
        padding: 8px 16px;
        border-radius: 4px;
        font-weight: bold;
      }
      QPushButton:hover {
        background-color: #45a049;
      }
      QPushButton:pressed {
        background-color: #3d8b40;
      }
      QPushButton:disabled {
        background-color: #cccccc;
        color: #666666;
      }
      QLineEdit, QComboBox, QSpinBox {
        padding: 5px;
        border: 1px solid #ddd;
        border-radius: 3px;
      }
      QExpandingLineEdit {
        padding: 5px;
        border: 1px solid #ddd;
        border-radius: 3px;
      }
      QTextEdit {
        border: 1px solid #ddd;
        border-radius: 3px;
      }
    `);

        this.win.show();
    }

    private createConnectionTab(): QWidget {
        const widget = new QWidget();
        const layout = new QBoxLayout(Direction.TopToBottom);
        widget.setLayout(layout);

        // 连接类型选择
        const typeGroup = new QGroupBox();
        typeGroup.setTitle("连接类型");
        const typeLayout = new QGridLayout();
        typeGroup.setLayout(typeLayout);

        const typeLabel = new QLabel();
        typeLabel.setText("协议类型:");
        const typeCombo = new QComboBox();
        typeCombo.addItems(["Modbus TCP", "Modbus RTU"]);

        typeLayout.addWidget(typeLabel, 0, 0);
        typeLayout.addWidget(typeCombo, 0, 1);

        // TCP配置
        const tcpGroup = new QGroupBox();
        tcpGroup.setTitle("TCP配置");
        const tcpLayout = new QGridLayout();
        tcpGroup.setLayout(tcpLayout);

        const hostLabel = new QLabel();
        hostLabel.setText("IP地址:");
        const hostEdit = new QLineEdit();
        hostEdit.setText("127.0.0.1");

        const portLabel = new QLabel();
        portLabel.setText("端口号:");
        const portSpin = new QSpinBox();
        portSpin.setRange(1, 65535);
        portSpin.setValue(502);

        tcpLayout.addWidget(hostLabel, 0, 0);
        tcpLayout.addWidget(hostEdit, 0, 1);
        tcpLayout.addWidget(portLabel, 1, 0);
        tcpLayout.addWidget(portSpin, 1, 1);

        // RTU配置
        const rtuGroup = new QGroupBox();
        rtuGroup.setTitle("RTU配置");
        const rtuLayout = new QGridLayout();
        rtuGroup.setLayout(rtuLayout);

        const portNameLabel = new QLabel();
        portNameLabel.setText("串口:");
        const portNameEdit = new QLineEdit();
        portNameEdit.setText("/dev/ttyUSB0");

        const baudLabel = new QLabel();
        baudLabel.setText("波特率:");
        const baudCombo = new QComboBox();
        baudCombo.addItems(["9600", "19200", "38400", "57600", "115200"]);
        baudCombo.setCurrentText("9600");

        const dataBitsLabel = new QLabel();
        dataBitsLabel.setText("数据位:");
        const dataBitsCombo = new QComboBox();
        dataBitsCombo.addItems(["7", "8"]);
        dataBitsCombo.setCurrentText("8");

        const stopBitsLabel = new QLabel();
        stopBitsLabel.setText("停止位:");
        const stopBitsCombo = new QComboBox();
        stopBitsCombo.addItems(["1", "2"]);
        stopBitsCombo.setCurrentText("1");

        const parityLabel = new QLabel();
        parityLabel.setText("校验位:");
        const parityCombo = new QComboBox();
        parityCombo.addItems(["none", "even", "odd"]);
        parityCombo.setCurrentText("none");

        rtuLayout.addWidget(portNameLabel, 0, 0);
        rtuLayout.addWidget(portNameEdit, 0, 1);
        rtuLayout.addWidget(baudLabel, 1, 0);
        rtuLayout.addWidget(baudCombo, 1, 1);
        rtuLayout.addWidget(dataBitsLabel, 2, 0);
        rtuLayout.addWidget(dataBitsCombo, 2, 1);
        rtuLayout.addWidget(stopBitsLabel, 3, 0);
        rtuLayout.addWidget(stopBitsCombo, 3, 1);
        rtuLayout.addWidget(parityLabel, 4, 0);
        rtuLayout.addWidget(parityCombo, 4, 1);

        // 连接按钮
        const connectBtn = new QPushButton();
        connectBtn.setText("连接");

        const disconnectBtn = new QPushButton();
        disconnectBtn.setText("断开连接");
        disconnectBtn.setEnabled(false);

        // 状态显示
        const statusLabel = new QLabel();
        statusLabel.setText("状态: 未连接");
        statusLabel.setStyleSheet("color: red; font-weight: bold;");

        // 事件处理
        typeCombo.addEventListener('currentTextChanged', (text: string) => {
            const isTCP = text === "Modbus TCP";
            tcpGroup.setEnabled(isTCP);
            rtuGroup.setEnabled(!isTCP);
            this.config.type = isTCP ? 'TCP' : 'RTU';
        });

        connectBtn.addEventListener('clicked', async () => {
            try {
                if (this.config.type === 'TCP') {
                    this.config.host = hostEdit.text();
                    this.config.port = portSpin.value();
                    await this.client.connectTCP(this.config.host, { port: this.config.port, timeout: 5000 });
                } else {
                    this.config.serialPort = portNameEdit.text();
                    this.config.baudRate = parseInt(baudCombo.currentText());
                    this.config.dataBits = parseInt(dataBitsCombo.currentText()) as 7 | 8;
                    this.config.stopBits = parseInt(stopBitsCombo.currentText()) as 1 | 2;
                    this.config.parity = parityCombo.currentText() as 'none' | 'even' | 'odd' | 'mark' | 'space';

                    await this.client.connectRTUBuffered(this.config.serialPort, {
                        baudRate: this.config.baudRate,
                        dataBits: this.config.dataBits,
                        stopBits: this.config.stopBits,
                        parity: this.config.parity
                    });
                }

                this.isConnected = true;
                statusLabel.setText("状态: 已连接");
                statusLabel.setStyleSheet("color: green; font-weight: bold;");
                connectBtn.setEnabled(false);
                disconnectBtn.setEnabled(true);
                this.startConnectionCheck(statusLabel, connectBtn, disconnectBtn);
            } catch (error) {
                statusLabel.setText(`状态: 连接失败 - ${error}`);
                statusLabel.setStyleSheet("color: red; font-weight: bold;");
            }
        });

        disconnectBtn.addEventListener('clicked', () => {
            this.stopConnectionCheck();
            this.client.close(() => {
                this.isConnected = false;
                statusLabel.setText("状态: 未连接");
                statusLabel.setStyleSheet("color: red; font-weight: bold;");
                connectBtn.setEnabled(true);
                disconnectBtn.setEnabled(false);
            });
        });

        // 初始状态
        rtuGroup.setEnabled(false);
        layout.addWidget(typeGroup);
        layout.addWidget(tcpGroup);
        layout.addWidget(rtuGroup);

        const buttonLayout = new QBoxLayout(Direction.LeftToRight);
        buttonLayout.addWidget(connectBtn);
        buttonLayout.addWidget(disconnectBtn);
        buttonLayout.addWidget(statusLabel);

        layout.addLayout(buttonLayout);
        layout.addStretch();

        return widget;
    }

    private createMasterTab(): QWidget {
        const widget = new QWidget();
        const layout = new QBoxLayout(Direction.TopToBottom);
        widget.setLayout(layout);

        // 读取配置区域
        const readConfigGroup = new QGroupBox();
        readConfigGroup.setTitle("读取配置 ");
        readConfigGroup.setCheckable(true);
        readConfigGroup.setChecked(true);
        const readConfigLayout = new QGridLayout();
        readConfigGroup.setLayout(readConfigLayout);

        const readSlaveIdLabel = new QLabel();
        readSlaveIdLabel.setText("从站ID:");
        const readSlaveIdSpin = new QSpinBox();
        readSlaveIdSpin.setRange(1, 247);
        readSlaveIdSpin.setValue(1);

        const readFunctionLabel = new QLabel();
        readFunctionLabel.setText("功能码:");
        const readFunctionCombo = new QComboBox();
        readFunctionCombo.addItems(["03 - 保持寄存器", "04 - 输入寄存器", "01 - 线圈", "02 - 离散输入"]);

        const readAddressLabel = new QLabel();
        readAddressLabel.setText("起始地址:");
        const readAddressSpin = new QSpinBox();
        readAddressSpin.setRange(0, 65535);
        readAddressSpin.setValue(0);

        const readLengthLabel = new QLabel();
        readLengthLabel.setText("读取长度:");
        const readLengthSpin = new QSpinBox();
        readLengthSpin.setRange(1, 125);
        readLengthSpin.setValue(10);

        const readDataTypeLabel = new QLabel();
        readDataTypeLabel.setText("数据类型:");
        const readDataTypeCombo = new QComboBox();
        readDataTypeCombo.addItems(["Int16", "UInt16", "Int32", "UInt32", "Float32", "Float64"]);

        const readEndianLabel = new QLabel();
        readEndianLabel.setText("字节序:");
        const readEndianCombo = new QComboBox();
        readEndianCombo.addItems(["大端", "小端"]);

        const autoReadLabel = new QLabel();
        autoReadLabel.setText("定时读取:");
        const autoReadCheck = new QCheckBox();
        autoReadCheck.setText("启用");

        const intervalLabel = new QLabel();
        intervalLabel.setText("间隔(ms):");
        const intervalSpin = new QSpinBox();
        intervalSpin.setRange(100, 10000);
        intervalSpin.setValue(1000);
        intervalSpin.setEnabled(false);

        const readBtn = new QPushButton();
        readBtn.setText("读取数据");

        readConfigLayout.addWidget(readSlaveIdLabel, 0, 0);
        readConfigLayout.addWidget(readSlaveIdSpin, 0, 1);
        readConfigLayout.addWidget(readFunctionLabel, 0, 2);
        readConfigLayout.addWidget(readFunctionCombo, 0, 3);
        readConfigLayout.addWidget(readAddressLabel, 1, 0);
        readConfigLayout.addWidget(readAddressSpin, 1, 1);
        readConfigLayout.addWidget(readLengthLabel, 1, 2);
        readConfigLayout.addWidget(readLengthSpin, 1, 3);
        readConfigLayout.addWidget(readDataTypeLabel, 2, 0);
        readConfigLayout.addWidget(readDataTypeCombo, 2, 1);
        readConfigLayout.addWidget(readEndianLabel, 2, 2);
        readConfigLayout.addWidget(readEndianCombo, 2, 3);
        readConfigLayout.addWidget(autoReadLabel, 3, 0);
        readConfigLayout.addWidget(autoReadCheck, 3, 1);
        readConfigLayout.addWidget(intervalLabel, 3, 2);
        readConfigLayout.addWidget(intervalSpin, 3, 3);
        readConfigLayout.addWidget(readBtn, 4, 0, 1, 4);

        // 写入配置区域
        const writeConfigGroup = new QGroupBox();
        writeConfigGroup.setTitle("写入配置");
        writeConfigGroup.setCheckable(true);
        writeConfigGroup.setChecked(true);
        const writeConfigLayout = new QGridLayout();
        writeConfigGroup.setLayout(writeConfigLayout);

        const writeSlaveIdLabel = new QLabel();
        writeSlaveIdLabel.setText("从站ID:");
        const writeSlaveIdSpin = new QSpinBox();
        writeSlaveIdSpin.setValue(1);

        const writeFunctionLabel = new QLabel();
        writeFunctionLabel.setText("功能码:");
        const writeFunctionCombo = new QComboBox();
        writeFunctionCombo.addItems(["06 - 写单个寄存器", "16 - 写多个寄存器", "05 - 写单个线圈", "15 - 写多个线圈"]);

        const writeAddressLabel = new QLabel();
        writeAddressLabel.setText("地址:");
        const writeAddressSpin = new QSpinBox();
        writeAddressSpin.setValue(0);

        const writeValueLabel = new QLabel();
        writeValueLabel.setText("写入值:");
        const writeValueEdit = new QLineEdit();
        writeValueEdit.setText("0");

        const writeDataTypeLabel = new QLabel();
        writeDataTypeLabel.setText("数据类型:");
        const writeDataTypeCombo = new QComboBox();
        writeDataTypeCombo.addItems(["Int16", "UInt16", "Int32", "UInt32", "Float32", "Float64"]);

        const writeBtn = new QPushButton();
        writeBtn.setText("写入数据");

        writeConfigLayout.addWidget(writeSlaveIdLabel, 0, 0);
        writeConfigLayout.addWidget(writeSlaveIdSpin, 0, 1);
        writeConfigLayout.addWidget(writeFunctionLabel, 0, 2);
        writeConfigLayout.addWidget(writeFunctionCombo, 0, 3);
        writeConfigLayout.addWidget(writeAddressLabel, 0, 4);
        writeConfigLayout.addWidget(writeAddressSpin, 0, 5);
        writeConfigLayout.addWidget(writeValueLabel, 1, 0);
        writeConfigLayout.addWidget(writeValueEdit, 1, 1);
        writeConfigLayout.addWidget(writeDataTypeLabel, 1, 2);
        writeConfigLayout.addWidget(writeDataTypeCombo, 1, 3);
        writeConfigLayout.addWidget(writeBtn, 1, 4);

        // 数据显示表格区域
        const dataDisplayGroup = new QGroupBox();
        dataDisplayGroup.setTitle("数据显示");
        dataDisplayGroup.setCheckable(true);
        dataDisplayGroup.setChecked(true);
        const dataDisplayLayout = new QBoxLayout(Direction.TopToBottom);
        dataDisplayGroup.setLayout(dataDisplayLayout);

        const dataTable = new QScrollArea();
        dataTable.setWidgetResizable(true);
        dataTable.setMaximumHeight(300);
        dataTable.setStyleSheet("QScrollArea { border: 1px solid #ccc; background-color: white; }");

        const dataWidget = new QWidget();
        const dataGridLayout = new QGridLayout();
        dataWidget.setLayout(dataGridLayout);
        dataTable.setWidget(dataWidget);

        dataDisplayLayout.addWidget(dataTable);

        // 操作日志
        const logGroup = new QGroupBox();
        logGroup.setTitle("操作日志");
        logGroup.setCheckable(true);
        logGroup.setChecked(true);
        const logLayout = new QBoxLayout(Direction.TopToBottom);
        logGroup.setLayout(logLayout);

        const logText = new QTextEdit();
        logText.setReadOnly(true);
        logText.setMaximumHeight(200);
        logText.setStyleSheet("font-family: 'Courier New', monospace; font-size: 12px; background-color: #f8f8f8;");
        logLayout.addWidget(logText);

        const clearLogBtn = new QPushButton();
        clearLogBtn.setText("清空日志");
        logLayout.addWidget(clearLogBtn);

        // 折叠功能实现
        let readConfigCollapsed = false;
        let writeConfigCollapsed = false;
        let dataDisplayCollapsed = false;
        let logCollapsed = false;

        readConfigGroup.addEventListener('clicked', () => {
            readConfigCollapsed = !readConfigCollapsed;
            readConfigGroup.setTitle(readConfigCollapsed ? "读取配置" : "读取配置 ");
            // 简单的折叠实现：隐藏/显示整个内容区域
            readSlaveIdLabel.setVisible(!readConfigCollapsed);
            readSlaveIdSpin.setVisible(!readConfigCollapsed);
            readFunctionLabel.setVisible(!readConfigCollapsed);
            readFunctionCombo.setVisible(!readConfigCollapsed);
            readAddressLabel.setVisible(!readConfigCollapsed);
            readAddressSpin.setVisible(!readConfigCollapsed);
            readLengthLabel.setVisible(!readConfigCollapsed);
            readLengthSpin.setVisible(!readConfigCollapsed);
            readDataTypeLabel.setVisible(!readConfigCollapsed);
            readDataTypeCombo.setVisible(!readConfigCollapsed);
            readEndianLabel.setVisible(!readConfigCollapsed);
            readEndianCombo.setVisible(!readConfigCollapsed);
            autoReadLabel.setVisible(!readConfigCollapsed);
            autoReadCheck.setVisible(!readConfigCollapsed);
            intervalLabel.setVisible(!readConfigCollapsed);
            intervalSpin.setVisible(!readConfigCollapsed);
            readBtn.setVisible(!readConfigCollapsed);
        });

        writeConfigGroup.addEventListener('clicked', () => {
            writeConfigCollapsed = !writeConfigCollapsed;
            writeConfigGroup.setTitle(writeConfigCollapsed ? "写入配置" : "写入配置 ");
            // 简单的折叠实现：隐藏/显示整个内容区域
            writeSlaveIdLabel.setVisible(!writeConfigCollapsed);
            writeSlaveIdSpin.setVisible(!writeConfigCollapsed);
            writeFunctionLabel.setVisible(!writeConfigCollapsed);
            writeFunctionCombo.setVisible(!writeConfigCollapsed);
            writeAddressLabel.setVisible(!writeConfigCollapsed);
            writeAddressSpin.setVisible(!writeConfigCollapsed);
            writeValueLabel.setVisible(!writeConfigCollapsed);
            writeValueEdit.setVisible(!writeConfigCollapsed);
            writeDataTypeLabel.setVisible(!writeConfigCollapsed);
            writeDataTypeCombo.setVisible(!writeConfigCollapsed);
            writeBtn.setVisible(!writeConfigCollapsed);
        });

        dataDisplayGroup.addEventListener('clicked', () => {
            dataDisplayCollapsed = !dataDisplayCollapsed;
            dataDisplayGroup.setTitle(dataDisplayCollapsed ? "数据显示" : "数据显示 ");
            dataTable.setVisible(!dataDisplayCollapsed);
        });

        logGroup.addEventListener('clicked', () => {
            logCollapsed = !logCollapsed;
            logGroup.setTitle(logCollapsed ? "操作日志" : "操作日志 ");
            logText.setVisible(!logCollapsed);
            clearLogBtn.setVisible(!logCollapsed);
        });

        // 定时读取功能
        let autoReadTimer: any = null;

        autoReadCheck.addEventListener('toggled', (checked: boolean) => {
            intervalSpin.setEnabled(checked);
            if (checked && this.isConnected) {
                autoReadTimer = setInterval(() => {
                    readBtn.click();
                }, intervalSpin.value());
            } else if (autoReadTimer) {
                clearInterval(autoReadTimer);
                autoReadTimer = null;
            }
        });

        intervalSpin.addEventListener('valueChanged', (value: number) => {
            if (autoReadTimer) {
                clearInterval(autoReadTimer);
                autoReadTimer = setInterval(() => {
                    readBtn.click();
                }, value);
            }
        });

        // 存储当前数据表格的标签，用于更新
        let currentDataLabels: QLabel[] = [];

        // 数据表格更新函数
        const updateDataTable = (address: number, data: any[], dataType: string, isLittleEndian: boolean) => {
            // 清空现有数据标签
            currentDataLabels.forEach(label => {
                label.hide();
                label.deleteLater();
            });
            currentDataLabels = [];

            // 创建新的数据widget
            const newDataWidget = new QWidget();
            const newDataGridLayout = new QGridLayout();

            // 设置间距，与从站表格保持一致
            newDataGridLayout.setSpacing(0);
            newDataGridLayout.setContentsMargins(0, 0, 0, 0);

            newDataWidget.setLayout(newDataGridLayout);

            const pairsPerRow = 6; // 每行显示6对地址-值，与从站保持一致
            const count = data.length;
            const rows = Math.ceil(count / pairsPerRow);

            // 添加标题行
            for (let col = 0; col < pairsPerRow; col++) {
                const addrHeaderLabel = new QLabel();
                addrHeaderLabel.setText(`地址`);
                addrHeaderLabel.setStyleSheet("font-weight: bold; color: #333333; border-bottom: 1px solid #ccc;border-right: 1px solid #ccc; padding: 5px; background-color: #f5f5f5;");

                const valueHeaderLabel = new QLabel();
                valueHeaderLabel.setText(`值`);
                valueHeaderLabel.setStyleSheet("font-weight: bold; color: #333333; border-bottom: 1px solid #ccc;border-right: 1px solid #ccc; padding: 5px; background-color: #f5f5f5;");

                newDataGridLayout.addWidget(addrHeaderLabel, 0, col * 2);
                newDataGridLayout.addWidget(valueHeaderLabel, 0, col * 2 + 1);

                currentDataLabels.push(addrHeaderLabel);
                currentDataLabels.push(valueHeaderLabel);
            }

            // 填充数据
            for (let row = 0; row < rows; row++) {
                for (let col = 0; col < pairsPerRow; col++) {
                    const index = row * pairsPerRow + col;
                    if (index >= count) break;

                    const addr = address + index;

                    // 创建地址标签
                    const addressLabel = new QLabel();
                    addressLabel.setText(addr.toString());
                    addressLabel.setStyleSheet("padding: 5px; color: #555555; border-bottom: 1px solid #ccc;border-right: 1px solid #ccc; background-color: #fafafa;");
                    newDataGridLayout.addWidget(addressLabel, row + 1, col * 2);
                    currentDataLabels.push(addressLabel);

                    // 检查是否为多寄存器数据类型的第二个及后续寄存器
                    let isSecondaryRegister = false;
                    if ((dataType === "Int32" || dataType === "UInt32" || dataType === "Float32") &&
                        index % 2 === 1) {
                        isSecondaryRegister = true;
                    } else if (dataType === "Float64" && index % 4 !== 0) {
                        isSecondaryRegister = true;
                    }

                    // 创建值标签
                    const valueLabel = new QLabel();

                    // 如果是多寄存器数据类型的第二个及后续寄存器，显示'-'
                    if (isSecondaryRegister) {
                        valueLabel.setText("-");
                        valueLabel.setStyleSheet("padding: 5px; color: #888888; border-bottom: 1px solid #ccc;border-right: 1px solid #ccc; background-color: #f8f8f8;");
                    } else {
                        let formattedValue;
                        if (dataType === "Float32" || dataType === "Float64" || dataType === "Int32" || dataType === "UInt32") {
                            // 对于多寄存器数据类型，需要获取相邻的寄存器数据
                            const registerData = [];
                            const registersNeeded = dataType === "Float64" ? 4 : 2;
                            for (let j = 0; j < registersNeeded && index + j < data.length; j++) {
                                registerData.push(data[index + j]);
                            }
                            const formatted = this.formatData(registerData, dataType, !isLittleEndian);
                            formattedValue = formatted.split(", ")[0] || "--";
                        } else {
                            formattedValue = this.formatSingleValue(data[index], dataType, !isLittleEndian);
                        }
                        valueLabel.setText(formattedValue);
                        valueLabel.setStyleSheet("padding: 5px; color: #000000; background-color: #f8f8f8; border-bottom: 1px solid #ccc;border-right: 1px solid #ccc;");
                    }

                    newDataGridLayout.addWidget(valueLabel, row + 1, col * 2 + 1);
                    currentDataLabels.push(valueLabel);
                }
            }

            // 更新滚动区域的widget
            dataTable.setWidget(newDataWidget);
        };

        // 清空日志按钮事件
        clearLogBtn.addEventListener('clicked', () => {
            logText.clear();
        });

        // 读取数据事件处理
        readBtn.addEventListener('clicked', async () => {
            if (!this.isConnected) {
                logText.append(`[${new Date().toLocaleTimeString()}] 错误: 请先连接到Modbus设备\n`);
                return;
            }

            try {
                this.client.setID(readSlaveIdSpin.value());
                const address = readAddressSpin.value();
                const length = readLengthSpin.value();
                const functionCode = readFunctionCombo.currentIndex();
                const functionText = readFunctionCombo.currentText();
                const dataType = readDataTypeCombo.currentText();
                const isLittleEndian = readEndianCombo.currentIndex() === 1;

                logText.append(`[${new Date().toLocaleTimeString()}] 读取数据: ${functionText}, 从站ID: ${readSlaveIdSpin.value()},  地址: ${address}, 长度: ${length}\n`);

                let result: any;
                switch (functionCode) {
                    case 0: // 保持寄存器
                        result = await this.client.readHoldingRegisters(address, length);
                        break;
                    case 1: // 输入寄存器
                        result = await this.client.readInputRegisters(address, length);
                        break;
                    case 2: // 线圈
                        result = await this.client.readCoils(address, length);
                        break;
                    case 3: // 离散输入
                        result = await this.client.readDiscreteInputs(address, length);
                        break;
                }

                // 更新数据表格
                updateDataTable(address, result.data, dataType, isLittleEndian);

                const formattedData = this.formatData(result.data, dataType, !isLittleEndian);
                logText.append(`[${new Date().toLocaleTimeString()}] 读取成功 - 数据: ${formattedData}\n\n`);
            } catch (error) {
                logText.append(`[${new Date().toLocaleTimeString()}] 读取失败: ${error}\n\n`);
            }
        });

        // 写入数据事件处理
        writeBtn.addEventListener('clicked', async () => {
            if (!this.isConnected) {
                logText.append(`[${new Date().toLocaleTimeString()}] 错误: 请先连接到Modbus设备\n`);
                return;
            }

            try {
                this.client.setID(writeSlaveIdSpin.value());
                const address = writeAddressSpin.value();
                const valueText = writeValueEdit.text();
                const functionCode = writeFunctionCombo.currentIndex();
                const functionText = writeFunctionCombo.currentText();
                const dataType = writeDataTypeCombo.currentText();

                logText.append(`[${new Date().toLocaleTimeString()}] 写入数据: ${functionText}, 从站ID: ${writeSlaveIdSpin.value()}, 地址: ${address}, 值: ${valueText}\n`);

                const value = this.parseValue(valueText, dataType);

                switch (functionCode) {
                    case 0: // 写单个寄存器
                        await this.client.writeRegister(address, Array.isArray(value) ? value[0] : value);
                        break;
                    case 1: // 写多个寄存器
                        await this.client.writeRegisters(address, Array.isArray(value) ? value : [value]);
                        break;
                    case 2: // 写单个线圈
                        await this.client.writeCoil(address, Boolean(Array.isArray(value) ? value[0] : value));
                        break;
                    case 3: // 写多个线圈
                        await this.client.writeCoils(address, Array.isArray(value) ? value.map(Boolean) : [Boolean(value)]);
                        break;
                }

                logText.append(`[${new Date().toLocaleTimeString()}] 写入成功\n\n`);
            } catch (error) {
                logText.append(`[${new Date().toLocaleTimeString()}] 写入失败: ${error}\n\n`);
            }
        })
        layout.addWidget(readConfigGroup);
        layout.addWidget(writeConfigGroup);
        layout.addWidget(dataDisplayGroup);
        layout.addWidget(logGroup);

        return widget;
    }

    private createSlaveTab(): QWidget {
        const widget = new QWidget();
        const layout = new QBoxLayout(Direction.TopToBottom);
        widget.setLayout(layout);

        // 从站配置
        const slaveGroup = new QGroupBox();
        slaveGroup.setTitle("从站配置 ");
        slaveGroup.setCheckable(true);
        slaveGroup.setChecked(true);
        const slaveLayout = new QGridLayout();
        slaveGroup.setLayout(slaveLayout);

        const slavePortLabel = new QLabel();
        slavePortLabel.setText("监听端口:");
        const slavePortSpin = new QSpinBox();
        slavePortSpin.setRange(1, 65535);
        slavePortSpin.setValue(502);

        const slaveIdLabel = new QLabel();
        slaveIdLabel.setText("从站ID:");
        const slaveIdSpin = new QSpinBox();
        slaveIdSpin.setRange(1, 247);
        slaveIdSpin.setValue(1);

        const startSlaveBtn = new QPushButton();
        startSlaveBtn.setText("启动从站");

        const stopSlaveBtn = new QPushButton();
        stopSlaveBtn.setText("停止从站");
        stopSlaveBtn.setEnabled(false);

        slaveLayout.addWidget(slavePortLabel, 0, 0);
        slaveLayout.addWidget(slavePortSpin, 0, 1);
        slaveLayout.addWidget(slaveIdLabel, 0, 2);
        slaveLayout.addWidget(slaveIdSpin, 0, 3);
        slaveLayout.addWidget(startSlaveBtn, 1, 0, 1, 2);
        slaveLayout.addWidget(stopSlaveBtn, 1, 2, 1, 2);

        // 显示配置区域
        const displayGroup = new QGroupBox();
        displayGroup.setTitle("显示配置 ");
        displayGroup.setCheckable(true);
        displayGroup.setChecked(true);
        const displayLayout = new QGridLayout();
        displayGroup.setLayout(displayLayout);

        const startAddrLabel = new QLabel();
        startAddrLabel.setText("起始地址:");
        const startAddrSpin = new QSpinBox();
        startAddrSpin.setRange(0, 65535);
        startAddrSpin.setValue(0);

        const countLabel = new QLabel();
        countLabel.setText("显示数量:");
        const countSpin = new QSpinBox();
        countSpin.setRange(1, 100);
        countSpin.setValue(20);

        const displayTypeLabel = new QLabel();
        displayTypeLabel.setText("显示类型:");
        const displayTypeCombo = new QComboBox();
        displayTypeCombo.addItems(["Bool", "Int16", "UInt16", "Int32", "UInt32", "Float32", "Float64"]);

        const endianLabel = new QLabel();
        endianLabel.setText("字节序:");
        const endianCombo = new QComboBox();
        endianCombo.addItems(["大端", "小端"]);

        const autoRefreshLabel = new QLabel();
        autoRefreshLabel.setText("自动刷新:");
        const autoRefreshCheck = new QCheckBox();
        autoRefreshCheck.setText("启用");

        const refreshIntervalLabel = new QLabel();
        refreshIntervalLabel.setText("刷新间隔(ms):");
        const refreshIntervalSpin = new QSpinBox();
        refreshIntervalSpin.setRange(100, 10000);
        refreshIntervalSpin.setValue(1000);
        refreshIntervalSpin.setEnabled(false);

        const refreshBtn = new QPushButton();
        refreshBtn.setText("手动刷新");

        displayLayout.addWidget(startAddrLabel, 0, 0);
        displayLayout.addWidget(startAddrSpin, 0, 1);
        displayLayout.addWidget(countLabel, 0, 2);
        displayLayout.addWidget(countSpin, 0, 3);
        displayLayout.addWidget(displayTypeLabel, 1, 0);
        displayLayout.addWidget(displayTypeCombo, 1, 1);
        displayLayout.addWidget(endianLabel, 1, 2);
        displayLayout.addWidget(endianCombo, 1, 3);
        displayLayout.addWidget(autoRefreshLabel, 2, 0);
        displayLayout.addWidget(autoRefreshCheck, 2, 1);
        displayLayout.addWidget(refreshIntervalLabel, 2, 2);
        displayLayout.addWidget(refreshIntervalSpin, 2, 3);
        displayLayout.addWidget(refreshBtn, 2, 4);

        // 寄存器显示区域
        const registerGroup = new QGroupBox();
        registerGroup.setTitle("寄存器数据");
        const registerLayout = new QBoxLayout(Direction.TopToBottom);
        registerGroup.setLayout(registerLayout);

        // 创建滚动区域
        const scrollArea = new QScrollArea();
        const scrollWidget = new QWidget();
        const gridLayout = new QGridLayout();
        scrollWidget.setLayout(gridLayout);
        scrollArea.setWidget(scrollWidget);
        scrollArea.setWidgetResizable(true);

        registerLayout.addWidget(scrollArea);

        // 存储标签组件的数组
        const addressLabels: QLabel[] = [];
        const valueLabels: QLabel[] = [];

        // 存储寄存器数据的数组
        const holdingRegisters = new Array(65536).fill(0);
        const inputRegisters = new Array(65536).fill(0);
        const coils = new Array(65536).fill(false);

        // 初始化寄存器数据显示
        const initializeTable = () => {
            const startAddr = startAddrSpin.value();
            const count = countSpin.value();
            const pairsPerRow = 6; // 每行显示6对地址-值
            const displayType = displayTypeCombo.currentText();
            const isBigEndian = endianCombo.currentIndex() === 0;

            // 清除现有的标签
            addressLabels.forEach(label => label.delete());
            valueLabels.forEach(label => label.delete());
            addressLabels.length = 0;
            valueLabels.length = 0;

            // 清除现有组件（通过重新创建滚动区域内容）
            const newScrollWidget = new QWidget();
            const newGridLayout = new QGridLayout();

            // 设置间距，允许留白
            newGridLayout.setSpacing(0);
            newGridLayout.setContentsMargins(0, 0, 0, 0);

            newScrollWidget.setLayout(newGridLayout);
            scrollArea.setWidget(newScrollWidget);

            // 计算行数
            const rows = Math.ceil(count / pairsPerRow);

            // 添加标题行
            for (let col = 0; col < pairsPerRow; col++) {
                const addrHeaderLabel = new QLabel();
                addrHeaderLabel.setText(`地址`);
                addrHeaderLabel.setStyleSheet("font-weight: bold; color: #333333; border-bottom: 1px solid #ccc;border-right: 1px solid #ccc; padding: 5px; background-color: #f5f5f5;");

                const valueHeaderLabel = new QLabel();
                valueHeaderLabel.setText(`值`);
                valueHeaderLabel.setStyleSheet("font-weight: bold; color: #333333; border-bottom: 1px solid #ccc;border-right: 1px solid #ccc; padding: 5px; background-color: #f5f5f5;");

                newGridLayout.addWidget(addrHeaderLabel, 0, col * 2);
                newGridLayout.addWidget(valueHeaderLabel, 0, col * 2 + 1);

                addressLabels.push(addrHeaderLabel);
                valueLabels.push(valueHeaderLabel);
            }

            // 填充数据
            for (let row = 0; row < rows; row++) {
                for (let col = 0; col < pairsPerRow; col++) {
                    const index = row * pairsPerRow + col;
                    if (index >= count) break;

                    const addr = startAddr + index;

                    // 创建地址标签
                    const addressLabel = new QLabel();
                    addressLabel.setText(addr.toString());
                    addressLabel.setStyleSheet("padding: 5px; color: #555555; border-bottom: 1px solid #ccc;border-right: 1px solid #ccc; background-color: #fafafa;");
                    newGridLayout.addWidget(addressLabel, row + 1, col * 2);
                    addressLabels.push(addressLabel);

                    // 检查是否为多寄存器数据类型的第二个及后续寄存器
                    let isSecondaryRegister = false;
                    if ((displayType === "Int32" || displayType === "UInt32" || displayType === "Float32") &&
                        (addr - startAddr) % 2 === 1) {
                        isSecondaryRegister = true;
                    } else if (displayType === "Float64" && (addr - startAddr) % 4 !== 0) {
                        isSecondaryRegister = true;
                    }

                    // 创建值标签
                    const valueLabel = new QLabel();

                    // 如果是多寄存器数据类型的第二个及后续寄存器，显示'-'
                    if (isSecondaryRegister) {
                        valueLabel.setText("-");
                        valueLabel.setStyleSheet("padding: 5px; color: #888888; border-bottom: 1px solid #ccc;border-right: 1px solid #ccc; background-color: #f8f8f8;");
                    } else {
                        // 根据显示类型计算值
                        let displayValue = "0";
                        try {
                            switch (displayType) {
                                case "Bool":
                                    displayValue = coils[addr] ? "true" : "false";
                                    break;
                                case "Int16":
                                    displayValue = ((holdingRegisters[addr] << 16) >> 16).toString(); // 符号扩展
                                    break;
                                case "UInt16":
                                    displayValue = holdingRegisters[addr].toString();
                                    break;
                                case "Int32":
                                    if (addr < 65535) {
                                        const val = isBigEndian
                                            ? (holdingRegisters[addr] << 16) | holdingRegisters[addr + 1]
                                            : (holdingRegisters[addr + 1] << 16) | holdingRegisters[addr];
                                        displayValue = ((val << 0) >> 0).toString(); // 转为有符号32位
                                    }
                                    break;
                                case "UInt32":
                                    if (addr < 65535) {
                                        const val = isBigEndian
                                            ? (holdingRegisters[addr] << 16) | holdingRegisters[addr + 1]
                                            : (holdingRegisters[addr + 1] << 16) | holdingRegisters[addr];
                                        displayValue = (val >>> 0).toString(); // 转为无符号32位
                                    }
                                    break;
                                case "Float32":
                                    if (addr < 65535) {
                                        const buffer = Buffer.allocUnsafe(4);
                                        if (isBigEndian) {
                                            buffer.writeUInt16BE(holdingRegisters[addr], 0);
                                            buffer.writeUInt16BE(holdingRegisters[addr + 1], 2);
                                        } else {
                                            buffer.writeUInt16LE(holdingRegisters[addr + 1], 0);
                                            buffer.writeUInt16LE(holdingRegisters[addr], 2);
                                        }
                                        displayValue = buffer.readFloatBE(0).toFixed(6);
                                    }
                                    break;
                                case "Float64":
                                    if (addr < 65532) {
                                        const buffer = Buffer.allocUnsafe(8);
                                        if (isBigEndian) {
                                            for (let j = 0; j < 4; j++) {
                                                buffer.writeUInt16BE(holdingRegisters[addr + j], j * 2);
                                            }
                                        } else {
                                            for (let j = 0; j < 4; j++) {
                                                buffer.writeUInt16LE(holdingRegisters[addr + 3 - j], j * 2);
                                            }
                                        }
                                        displayValue = buffer.readDoubleBE(0).toFixed(10);
                                    }
                                    break;
                            }
                        } catch (e) {
                            displayValue = "错误";
                        }

                        valueLabel.setText(displayValue);
                        valueLabel.setStyleSheet("padding: 5px; color: #000000; background-color: #f8f8f8; border-bottom: 1px solid #ccc;border-right: 1px solid #ccc;");
                    }

                    newGridLayout.addWidget(valueLabel, row + 1, col * 2 + 1);
                    valueLabels.push(valueLabel);
                }
            }
        };

        // 自动刷新定时器
        let autoRefreshTimer: NodeJS.Timeout | null = null;

        const startAutoRefresh = () => {
            if (autoRefreshTimer) {
                clearInterval(autoRefreshTimer);
            }
            const interval = refreshIntervalSpin.value();
            autoRefreshTimer = setInterval(() => {
                initializeTable();
            }, interval);
        };

        const stopAutoRefresh = () => {
            if (autoRefreshTimer) {
                clearInterval(autoRefreshTimer);
                autoRefreshTimer = null;
            }
        };

        // 添加显示配置组件的折叠事件监听器
        displayGroup.addEventListener('toggled', (checked) => {
            displayGroup.setTitle(checked ? "显示配置 " : "显示配置");
            // 手动控制子组件的可见性
            startAddrLabel.setVisible(checked);
            startAddrSpin.setVisible(checked);
            countLabel.setVisible(checked);
            countSpin.setVisible(checked);
            displayTypeLabel.setVisible(checked);
            displayTypeCombo.setVisible(checked);
            endianLabel.setVisible(checked);
            endianCombo.setVisible(checked);
            autoRefreshLabel.setVisible(checked);
            autoRefreshCheck.setVisible(checked);
            refreshIntervalLabel.setVisible(checked);
            refreshIntervalSpin.setVisible(checked);
            refreshBtn.setVisible(checked);
        });

        slaveGroup.addEventListener('toggled', (checked) => {
            slaveGroup.setTitle(checked ? "从站配置 " : "从站配置");
            // 手动控制子组件的可见性
            slavePortLabel.setVisible(checked);
            slavePortSpin.setVisible(checked);
            slaveIdLabel.setVisible(checked);
            slaveIdSpin.setVisible(checked);
            startSlaveBtn.setVisible(checked);
            stopSlaveBtn.setVisible(checked);
        });

        // 初始化表格
        initializeTable();

        // 刷新按钮事件
        refreshBtn.addEventListener('clicked', () => {
            initializeTable();
            logText.append("表格已手动刷新\n");
        });

        // 自动刷新控制
        autoRefreshCheck.addEventListener('toggled', (checked) => {
            refreshIntervalSpin.setEnabled(checked);
            if (checked) {
                startAutoRefresh();
                logText.append(`自动刷新已启用，间隔${refreshIntervalSpin.value()}ms\n`);
            } else {
                stopAutoRefresh();
                logText.append("自动刷新已停用\n");
            }
        });

        // 刷新间隔变化时重启定时器
        refreshIntervalSpin.addEventListener('valueChanged', () => {
            if (autoRefreshCheck.isChecked()) {
                startAutoRefresh();
                logText.append(`刷新间隔已更新为${refreshIntervalSpin.value()}ms\n`);
            }
        });

        // 配置变化时自动刷新
        startAddrSpin.addEventListener('valueChanged', () => initializeTable());
        countSpin.addEventListener('valueChanged', () => initializeTable());
        displayTypeCombo.addEventListener('currentTextChanged', () => initializeTable());
        endianCombo.addEventListener('currentIndexChanged', () => initializeTable());

        // 日志显示
        const logGroup = new QGroupBox();
        logGroup.setTitle("运行日志 ");
        logGroup.setCheckable(true);
        logGroup.setChecked(true);
        const logLayout = new QBoxLayout(Direction.TopToBottom);
        logGroup.setLayout(logLayout);

        const logText = new QTextEdit();
        logText.setReadOnly(true);
        logText.setMaximumHeight(150);
        logLayout.addWidget(logText);

        // 添加日志组件的折叠事件监听器
        logGroup.addEventListener('toggled', (checked) => {
            logGroup.setTitle(checked ? "运行日志 " : "运行日志");
            // 手动控制子组件的可见性
            logText.setVisible(checked);
        });

        // 数据写入区域
        const writeGroup = new QGroupBox();
        writeGroup.setTitle("数据写入 ");
        writeGroup.setCheckable(true);
        writeGroup.setChecked(true);
        const writeLayout = new QGridLayout();
        writeGroup.setLayout(writeLayout);

        const writeAddrLabel = new QLabel();
        writeAddrLabel.setText("写入地址:");
        const writeAddrInput = new QLineEdit();
        writeAddrInput.setPlaceholderText("地址");
        writeAddrInput.setMaximumWidth(80);

        const writeTypeLabel = new QLabel();
        writeTypeLabel.setText("数据类型:");
        const writeTypeCombo = new QComboBox();
        writeTypeCombo.addItems(["保持寄存器(UInt16)", "输入寄存器(UInt16)", "线圈(Bool)", "Int16", "Int32", "UInt32", "Float32", "Float64"]);
        writeTypeCombo.setMaximumWidth(150);

        const writeEndianLabel = new QLabel();
        writeEndianLabel.setText("字节序:");
        const writeEndianCombo = new QComboBox();
        writeEndianCombo.addItems(["大端", "小端"]);
        writeEndianCombo.setMaximumWidth(80);

        const writeValueLabel = new QLabel();
        writeValueLabel.setText("值:");
        const writeValueInput = new QLineEdit();
        writeValueInput.setPlaceholderText("数值");
        writeValueInput.setMaximumWidth(120);

        const writeBtn = new QPushButton();
        writeBtn.setText("写入");
        writeBtn.setMaximumWidth(60);

        writeLayout.addWidget(writeAddrLabel, 0, 0);
        writeLayout.addWidget(writeAddrInput, 0, 1);
        writeLayout.addWidget(writeTypeLabel, 0, 2);
        writeLayout.addWidget(writeTypeCombo, 0, 3);
        writeLayout.addWidget(writeEndianLabel, 1, 0);
        writeLayout.addWidget(writeEndianCombo, 1, 1);
        writeLayout.addWidget(writeValueLabel, 1, 2);
        writeLayout.addWidget(writeValueInput, 1, 3);
        writeLayout.addWidget(writeBtn, 1, 4);

        // 统一写入按钮事件
        writeBtn.addEventListener('clicked', () => {
            const address = parseInt(writeAddrInput.text()) || 0;
            const dataType = writeTypeCombo.currentIndex();
            const inputValue = writeValueInput.text();
            const isLittleEndian = writeEndianCombo.currentIndex() === 1;

            if (address < 0 || address >= 65536) {
                logText.append(`地址错误: ${address} (需要0-65535)\n`);
                return;
            }

            switch (dataType) {
                case 0: // 保持寄存器(UInt16)
                    const holdingValue = parseInt(inputValue) || 0;
                    if (holdingValue >= 0 && holdingValue <= 65535) {
                        holdingRegisters[address] = holdingValue;
                        logText.append(`写入保持寄存器: 地址=${address}, 值=${holdingValue}\n`);
                    } else {
                        logText.append(`保持寄存器值错误: ${inputValue} (需要0-65535)\n`);
                    }
                    break;

                case 1: // 输入寄存器(UInt16)
                    const inputRegValue = parseInt(inputValue) || 0;
                    if (inputRegValue >= 0 && inputRegValue <= 65535) {
                        inputRegisters[address] = inputRegValue;
                        logText.append(`写入输入寄存器: 地址=${address}, 值=${inputRegValue}\n`);
                    } else {
                        logText.append(`输入寄存器值错误: ${inputValue} (需要0-65535)\n`);
                    }
                    break;

                case 2: // 线圈(Bool)
                    const coilValue = inputValue.toLowerCase() === 'true' || inputValue === '1';
                    coils[address] = coilValue;
                    logText.append(`写入线圈: 地址=${address}, 值=${coilValue}\n`);
                    break;

                case 3: // Int16
                    const int16Value = parseInt(inputValue) || 0;
                    if (int16Value >= -32768 && int16Value <= 32767) {
                        holdingRegisters[address] = int16Value < 0 ? 65536 + int16Value : int16Value;
                        logText.append(`写入Int16: 地址=${address}, 值=${int16Value}\n`);
                    } else {
                        logText.append(`Int16值错误: ${inputValue} (需要-32768到32767)\n`);
                    }
                    break;

                case 4: // Int32
                    const int32Value = parseInt(inputValue) || 0;
                    if (int32Value >= -2147483648 && int32Value <= 2147483647 && address < 65535) {
                        const uint32Value = int32Value < 0 ? 4294967296 + int32Value : int32Value;
                        if (isLittleEndian) {
                            holdingRegisters[address] = uint32Value & 0xFFFF;
                            holdingRegisters[address + 1] = (uint32Value >> 16) & 0xFFFF;
                        } else {
                            holdingRegisters[address] = (uint32Value >> 16) & 0xFFFF;
                            holdingRegisters[address + 1] = uint32Value & 0xFFFF;
                        }
                        logText.append(`写入Int32: 地址=${address}, 值=${int32Value}\n`);
                    } else {
                        logText.append(`Int32值错误或地址不足: ${inputValue}\n`);
                    }
                    break;

                case 5: // UInt32
                    const uint32Value = parseInt(inputValue) || 0;
                    if (uint32Value >= 0 && uint32Value <= 4294967295 && address < 65535) {
                        if (isLittleEndian) {
                            holdingRegisters[address] = uint32Value & 0xFFFF;
                            holdingRegisters[address + 1] = (uint32Value >> 16) & 0xFFFF;
                        } else {
                            holdingRegisters[address] = (uint32Value >> 16) & 0xFFFF;
                            holdingRegisters[address + 1] = uint32Value & 0xFFFF;
                        }
                        logText.append(`写入UInt32: 地址=${address}, 值=${uint32Value}\n`);
                    } else {
                        logText.append(`UInt32值错误或地址不足: ${inputValue}\n`);
                    }
                    break;

                case 6: // Float32
                    const float32Value = parseFloat(inputValue) || 0;
                    if (!isNaN(float32Value) && address < 65535) {
                        const buffer = new ArrayBuffer(4);
                        const floatView = new Float32Array(buffer);
                        const uint16View = new Uint16Array(buffer);
                        floatView[0] = float32Value;
                        if (isLittleEndian) {
                            holdingRegisters[address] = uint16View[0];
                            holdingRegisters[address + 1] = uint16View[1];
                        } else {
                            holdingRegisters[address] = uint16View[1];
                            holdingRegisters[address + 1] = uint16View[0];
                        }
                        logText.append(`写入Float32: 地址=${address}, 值=${float32Value}\n`);
                    } else {
                        logText.append(`Float32值错误或地址不足: ${inputValue}\n`);
                    }
                    break;

                case 7: // Float64
                    const float64Value = parseFloat(inputValue) || 0;
                    if (!isNaN(float64Value) && address < 65533) {
                        const buffer = new ArrayBuffer(8);
                        const doubleView = new Float64Array(buffer);
                        const uint16View = new Uint16Array(buffer);
                        doubleView[0] = float64Value;
                        if (isLittleEndian) {
                            holdingRegisters[address] = uint16View[0];
                            holdingRegisters[address + 1] = uint16View[1];
                            holdingRegisters[address + 2] = uint16View[2];
                            holdingRegisters[address + 3] = uint16View[3];
                        } else {
                            holdingRegisters[address] = uint16View[3];
                            holdingRegisters[address + 1] = uint16View[2];
                            holdingRegisters[address + 2] = uint16View[1];
                            holdingRegisters[address + 3] = uint16View[0];
                        }
                        logText.append(`写入Float64: 地址=${address}, 值=${float64Value}\n`);
                    } else {
                        logText.append(`Float64值错误或地址不足: ${inputValue}\n`);
                    }
                    break;
            }

            // 刷新表格显示
            initializeTable();
            writeValueInput.clear();
        });

        // 添加数据写入组件的折叠事件监听器
        writeGroup.addEventListener('toggled', (checked) => {
            writeGroup.setTitle(checked ? "数据写入 " : "数据写入");
            // 手动控制子组件的可见性
            writeAddrLabel.setVisible(checked);
            writeAddrInput.setVisible(checked);
            writeTypeLabel.setVisible(checked);
            writeTypeCombo.setVisible(checked);
            writeEndianLabel.setVisible(checked);
            writeEndianCombo.setVisible(checked);
            writeValueLabel.setVisible(checked);
            writeValueInput.setVisible(checked);
            writeBtn.setVisible(checked);
        });

        // 网格布局已通过scrollArea添加

        // 从站日志显示
        const slaveLogGroup = new QGroupBox();
        slaveLogGroup.setTitle("从站日志 ");
        slaveLogGroup.setCheckable(true);
        slaveLogGroup.setChecked(true);
        const slaveLogLayout = new QBoxLayout(Direction.TopToBottom);
        slaveLogGroup.setLayout(slaveLogLayout);

        slaveLogLayout.addWidget(logText);

        // 添加从站日志组件的折叠事件监听器
        slaveLogGroup.addEventListener('toggled', (checked) => {
            slaveLogGroup.setTitle(checked ? "从站日志 " : "从站日志");
            // 手动控制子组件的可见性
            logText.setVisible(checked);
        });

        // 事件处理
        startSlaveBtn.addEventListener('clicked', () => {
            const port = slavePortSpin.value();
            const slaveId = slaveIdSpin.value(); // 获取配置的从站ID

            // 创建Modbus向量对象，定义从站的数据处理方法
            const vector = {
                // 读取线圈状态 (FC01)
                getCoil: (addr: number, unitID: number) => {
                    logText.append(`读取线圈: 地址=${addr}, 单元ID=${unitID}\n`);
                    return coils[addr] || false;
                },

                // 读取离散输入状态 (FC02)
                getDiscreteInput: (addr: number, unitID: number) => {
                    logText.append(`读取离散输入: 地址=${addr}, 单元ID=${unitID}\n`);
                    return coils[addr] || false; // 使用相同的数组
                },

                // 读取保持寄存器 (FC03)
                getHoldingRegister: (addr: number, unitID: number) => {
                    logText.append(`读取保持寄存器: 地址=${addr}, 单元ID=${unitID}\n`);
                    return holdingRegisters[addr] || 0;
                },

                // 读取输入寄存器 (FC04)
                getInputRegister: (addr: number, unitID: number) => {
                    logText.append(`读取输入寄存器: 地址=${addr}, 单元ID=${unitID}\n`);
                    return inputRegisters[addr] || 0;
                },

                // 写入单个线圈 (FC05)
                setCoil: (addr: number, value: boolean, unitID: number) => {
                    logText.append(`写入线圈: 地址=${addr}, 值=${value}, 单元ID=${unitID}\n`);
                    coils[addr] = value;
                    return true;
                },

                // 写入单个寄存器 (FC06)
                setRegister: (addr: number, value: number, unitID: number) => {
                    logText.append(`写入寄存器: 地址=${addr}, 值=${value}, 单元ID=${unitID}\n`);
                    holdingRegisters[addr] = value;
                    return true;
                }
            };

            console.log(slaveId);

            // 创建Modbus TCP服务器
            this.modbusServer = new ServerTCP(vector, {
                host: '0.0.0.0',
                port: port,
                unitID: slaveId
            });

            // 监听错误事件
            this.modbusServer.on('error', (err) => {
                logText.append(`服务器错误: ${err.message}\n`);
            });

            this.modbusServer.on('initialized', () => {
                logText.append(`Modbus服务器已初始化\n`);
            });

            // 启动服务器
            logText.append(`从站启动，监听端口: ${port}, 单元ID: ${slaveId}\n`);
            startSlaveBtn.setEnabled(false);
            stopSlaveBtn.setEnabled(true);
        });

        stopSlaveBtn.addEventListener('clicked', () => {
            if (this.modbusServer) {
                this.modbusServer.close(() => {
                    logText.append(`从站已停止\n`);
                    startSlaveBtn.setEnabled(true);
                    stopSlaveBtn.setEnabled(false);
                });
                this.modbusServer = null;
            }
        });

        layout.addWidget(slaveGroup);
        layout.addWidget(displayGroup);
        layout.addWidget(registerGroup);
        layout.addWidget(writeGroup);
        layout.addWidget(slaveLogGroup);

        return widget;
    }

    private formatData(data: number[], dataType: string, bigEndian: boolean): string {
        if (!data || data.length === 0) return "无数据";

        const results: string[] = [];

        switch (dataType) {
            case "Int16":
                data.forEach(val => {
                    const signed = val > 32767 ? val - 65536 : val;
                    results.push(signed.toString());
                });
                break;
            case "UInt16":
                results.push(...data.map(val => val.toString()));
                break;
            case "Int32":
                for (let i = 0; i < data.length - 1; i += 2) {
                    const high = bigEndian ? data[i] : data[i + 1];
                    const low = bigEndian ? data[i + 1] : data[i];
                    const val = (high << 16) | low;
                    const signed = val > 2147483647 ? val - 4294967296 : val;
                    results.push(signed.toString());
                }
                break;
            case "UInt32":
                for (let i = 0; i < data.length - 1; i += 2) {
                    const high = bigEndian ? data[i] : data[i + 1];
                    const low = bigEndian ? data[i + 1] : data[i];
                    const val = (high << 16) | low;
                    results.push((val >>> 0).toString());
                }
                break;
            case "Float32":
                for (let i = 0; i < data.length - 1; i += 2) {
                    const high = bigEndian ? data[i] : data[i + 1];
                    const low = bigEndian ? data[i + 1] : data[i];
                    const buffer = Buffer.allocUnsafe(4);
                    buffer.writeUInt16BE(high, 0);
                    buffer.writeUInt16BE(low, 2);
                    const val = buffer.readFloatBE(0);
                    results.push(val.toFixed(6));
                }
                break;
            default:
                results.push(...data.map(val => val.toString()));
        }

        return results.join(", ");
    }


    private parseValue(valueStr: string, dataType: string): number | number[] {
        const value = parseFloat(valueStr);

        switch (dataType) {
            case "Int16":
                return Math.max(-32768, Math.min(32767, Math.round(value)));
            case "UInt16":
                return Math.max(0, Math.min(65535, Math.round(value)));
            case "Int32":
                const int32 = Math.max(-2147483648, Math.min(2147483647, Math.round(value)));
                return [(int32 >> 16) & 0xFFFF, int32 & 0xFFFF];
            case "UInt32":
                const uint32 = Math.max(0, Math.min(4294967295, Math.round(value)));
                return [(uint32 >> 16) & 0xFFFF, uint32 & 0xFFFF];
            case "Float32":
                const buffer = Buffer.allocUnsafe(4);
                buffer.writeFloatBE(value, 0);
                return [buffer.readUInt16BE(0), buffer.readUInt16BE(2)];
            default:
                return Math.round(value);
        }
    }

    private formatSingleValue(value: number, dataType: string, bigEndian: boolean): string {
        if (value === undefined || value === null) return "--";

        switch (dataType) {
            case "Bool":
                return value ? "1" : "0";
            case "Int16":
                const signed = value > 32767 ? value - 65536 : value;
                return signed.toString();
            case "UInt16":
                return value.toString();
            case "Int32":
            case "UInt32":
            case "Float32":
            case "Float64":
                // 对于多寄存器数据类型，显示原始值
                return value.toString();
            default:
                return value.toString();
        }
    }

    // 启动连接状态检测
    private startConnectionCheck(statusLabel: QLabel, connectBtn: QPushButton, disconnectBtn: QPushButton): void {
        // 清除之前的定时器
        this.stopConnectionCheck();

        // 每5秒检测一次连接状态
        this.connectionCheckTimer = setInterval(async () => {
            try {
                if (this.isConnected) {
                    // 尝试读取一个寄存器来测试连接
                    this.client.setID(1);
                    await this.client.readHoldingRegisters(0, 1);
                }
            } catch (error) {
                // 连接已断开
                this.isConnected = false;
                statusLabel.setText("状态: 连接已断开");
                statusLabel.setStyleSheet("color: red; font-weight: bold;");
                connectBtn.setEnabled(true);
                disconnectBtn.setEnabled(false);
                this.stopConnectionCheck();

                // 关闭客户端连接
                this.client.close(() => { });
            }
        }, 5000);
    }

    // 停止连接状态检测
    private stopConnectionCheck(): void {
        if (this.connectionCheckTimer) {
            clearInterval(this.connectionCheckTimer);
            this.connectionCheckTimer = null;
        }
    }

    show(): void {
        this.win.show();
        (global as any).win = this.win;
    }
}

function main(): void {
    const app = new ModbusTestApp();
    app.show();
}

main();
