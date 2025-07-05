import {
    Direction,
    QAction,
    QBoxLayout,
    QCheckBox,
    QComboBox,
    QDialog,
    QDoubleSpinBox,
    QGridLayout,
    QGroupBox,
    QIcon,
    QKeySequence,
    QLabel,
    QLineEdit,
    QMainWindow,
    QMenu,
    QMenuBar,
    QPushButton,
    QScrollArea,
    QSpinBox,
    QTabWidget,
    QTextEdit,
    QWidget
} from '@nodegui/nodegui';
import * as fs from 'fs';
import ModbusRTU, { ServerTCP } from 'modbus-serial';
import * as path from 'path';
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

    // 添加连接状态相关的UI组件引用

    private quickConnectAction: QAction | null = null;
    private disconnectAction: QAction | null = null;
    private connectionDialog: QDialog | null = null;
    private tabWidget: QTabWidget | null = null;
    private isSlaveRunning = false;

    // 日志组件引用
    private masterLogText: QTextEdit | null = null;
    private slaveLogText: QTextEdit | null = null;
    private masterLogGroup: QGroupBox | null = null;
    private slaveLogGroup: QGroupBox | null = null;

    constructor() {
        this.client = new ModbusRTU();
        this.win = new QMainWindow();
        const winLogo = new QIcon(path.join(__dirname, '../assets/logo.png'))
        this.win.setWindowIcon(winLogo);

        // console.log(QStyleFactory.keys());

        // QApplication.setStyle(QStyleFactory.create('macOS'));
        this.setupUI();
    }

    private setupUI(): void {
        this.win.setWindowTitle("ModbusTsetTool");
        this.win.resize(1200, 700);

        // 创建菜单栏
        this.createMenuBar();

        const centralWidget = new QWidget();
        const mainLayout = new QBoxLayout(Direction.TopToBottom);
        centralWidget.setLayout(mainLayout);

        // 连接状态指示器将在主站面板中创建

        // 创建标签页（移除连接配置标签页）
        this.tabWidget = new QTabWidget();

        // 主站功能标签页
        const masterTab = this.createMasterTab();
        this.tabWidget.addTab(masterTab, new QIcon(), "主站功能");

        // 从站功能标签页
        const slaveTab = this.createSlaveTab();
        this.tabWidget.addTab(slaveTab, new QIcon(), "从站功能");

        // 创建状态指示器并更新标签页标题
        this.createTabStatusIndicators();

        mainLayout.addWidget(this.tabWidget);
        this.win.setCentralWidget(centralWidget);

        this.loadStyleSheet();
        this.win.show();
    }

    private createMenuBar(): void {
        const menuBar = new QMenuBar();

        // 连接菜单
        const connectionMenu = new QMenu();
        connectionMenu.setTitle("连接");

        // 连接配置动作
        const configAction = new QAction();
        configAction.setText("连接配置...");
        configAction.setShortcut(new QKeySequence("Ctrl+C"));
        configAction.addEventListener('triggered', () => {
            this.showConnectionDialog();
        });

        // 快速连接动作
        this.quickConnectAction = new QAction();
        this.quickConnectAction.setText("快速连接");
        this.quickConnectAction.setShortcut(new QKeySequence("Ctrl+Q"));
        this.quickConnectAction.addEventListener('triggered', () => {
            this.quickConnect();
        });

        // 断开连接动作
        this.disconnectAction = new QAction();
        this.disconnectAction.setText("断开连接");
        this.disconnectAction.setShortcut(new QKeySequence("Ctrl+D"));
        this.disconnectAction.setEnabled(false);
        this.disconnectAction.addEventListener('triggered', () => {
            this.disconnect();
        });

        connectionMenu.addAction(configAction);
        connectionMenu.addSeparator();
        connectionMenu.addAction(this.quickConnectAction);
        connectionMenu.addAction(this.disconnectAction);

        // 日志菜单
        const logMenu = new QMenu();
        logMenu.setTitle("日志");

        // 显示/隐藏日志动作
        const toggleLogsAction = new QAction();
        toggleLogsAction.setText("显示/隐藏日志");
        toggleLogsAction.setShortcut(new QKeySequence("Ctrl+H"));
        toggleLogsAction.addEventListener('triggered', () => {
            this.toggleLogVisibility();
        });

        logMenu.addAction(toggleLogsAction);

        menuBar.addMenu(connectionMenu);
        menuBar.addMenu(logMenu);
        this.win.setMenuBar(menuBar);
    }

    private showConnectionDialog(): void {
        const dialog = new QDialog();
        dialog.setWindowTitle("连接配置");
        dialog.resize(400, 500);

        const layout = new QBoxLayout(Direction.TopToBottom);
        dialog.setLayout(layout);

        // 连接类型选择
        const typeGroup = new QGroupBox();
        typeGroup.setTitle("连接类型");
        const typeLayout = new QGridLayout();
        typeGroup.setLayout(typeLayout);

        const typeLabel = new QLabel();
        typeLabel.setText("协议类型:");
        const typeCombo = new QComboBox();
        typeCombo.addItems(["Modbus TCP", "Modbus RTU"]);
        typeCombo.setCurrentText(this.config.type === 'TCP' ? "Modbus TCP" : "Modbus RTU");

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
        hostEdit.setText(this.config.host || "127.0.0.1");

        const portLabel = new QLabel();
        portLabel.setText("端口号:");
        const portSpin = new QSpinBox();
        portSpin.setRange(1, 65535);
        portSpin.setValue(this.config.port || 502);

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
        portNameEdit.setText(this.config.serialPort || "/dev/ttyUSB0");

        const baudLabel = new QLabel();
        baudLabel.setText("波特率:");
        const baudCombo = new QComboBox();
        baudCombo.addItems(["9600", "19200", "38400", "57600", "115200"]);
        baudCombo.setCurrentText((this.config.baudRate || 9600).toString());

        const dataBitsLabel = new QLabel();
        dataBitsLabel.setText("数据位:");
        const dataBitsCombo = new QComboBox();
        dataBitsCombo.addItems(["7", "8"]);
        dataBitsCombo.setCurrentText((this.config.dataBits || 8).toString());

        const stopBitsLabel = new QLabel();
        stopBitsLabel.setText("停止位:");
        const stopBitsCombo = new QComboBox();
        stopBitsCombo.addItems(["1", "2"]);
        stopBitsCombo.setCurrentText((this.config.stopBits || 1).toString());

        const parityLabel = new QLabel();
        parityLabel.setText("校验位:");
        const parityCombo = new QComboBox();
        parityCombo.addItems(["none", "even", "odd"]);
        parityCombo.setCurrentText(this.config.parity || "none");

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

        // 按钮
        const buttonLayout = new QBoxLayout(Direction.LeftToRight);
        const okBtn = new QPushButton();
        okBtn.setText("确定");
        const cancelBtn = new QPushButton();
        cancelBtn.setText("取消");
        const connectBtn = new QPushButton();
        connectBtn.setText("连接");

        buttonLayout.addStretch();
        buttonLayout.addWidget(connectBtn);
        buttonLayout.addWidget(okBtn);
        buttonLayout.addWidget(cancelBtn);

        // 事件处理
        typeCombo.addEventListener('currentTextChanged', (text: string) => {
            const isTCP = text === "Modbus TCP";
            tcpGroup.setEnabled(isTCP);
            rtuGroup.setEnabled(!isTCP);
        });

        // 初始状态
        const isTCP = this.config.type === 'TCP';
        tcpGroup.setEnabled(isTCP);
        rtuGroup.setEnabled(!isTCP);

        okBtn.addEventListener('clicked', () => {
            // 保存配置
            const isTCP = typeCombo.currentText() === "Modbus TCP";
            this.config.type = isTCP ? 'TCP' : 'RTU';

            if (isTCP) {
                this.config.host = hostEdit.text();
                this.config.port = portSpin.value();
            } else {
                this.config.serialPort = portNameEdit.text();
                this.config.baudRate = parseInt(baudCombo.currentText());
                this.config.dataBits = parseInt(dataBitsCombo.currentText()) as 7 | 8;
                this.config.stopBits = parseInt(stopBitsCombo.currentText()) as 1 | 2;
                this.config.parity = parityCombo.currentText() as 'none' | 'even' | 'odd' | 'mark' | 'space';
            }

            dialog.close();
        });

        cancelBtn.addEventListener('clicked', () => {
            dialog.close();
        });

        connectBtn.addEventListener('clicked', async () => {
            // 保存配置并连接
            const isTCP = typeCombo.currentText() === "Modbus TCP";
            this.config.type = isTCP ? 'TCP' : 'RTU';

            if (isTCP) {
                this.config.host = hostEdit.text();
                this.config.port = portSpin.value();
            } else {
                this.config.serialPort = portNameEdit.text();
                this.config.baudRate = parseInt(baudCombo.currentText());
                this.config.dataBits = parseInt(dataBitsCombo.currentText()) as 7 | 8;
                this.config.stopBits = parseInt(stopBitsCombo.currentText()) as 1 | 2;
                this.config.parity = parityCombo.currentText() as 'none' | 'even' | 'odd' | 'mark' | 'space';
            }

            await this.quickConnect();
            dialog.close();
        });

        layout.addWidget(typeGroup);
        layout.addWidget(tcpGroup);
        layout.addWidget(rtuGroup);
        layout.addLayout(buttonLayout);

        dialog.exec();
    }

    private async quickConnect(): Promise<void> {
        // 创建连接状态弹出框
        this.connectionDialog = new QDialog();
        this.connectionDialog.setWindowTitle("连接状态");
        this.connectionDialog.setModal(true);
        this.connectionDialog.setFixedSize(300, 150);

        const dialogLayout = new QBoxLayout(Direction.TopToBottom);
        this.connectionDialog.setLayout(dialogLayout);

        const statusLabel = new QLabel();
        statusLabel.setText("正在连接...");
        statusLabel.setAlignment(0x0004); // AlignCenter
        statusLabel.setStyleSheet("font-size: 14px; padding: 20px;");

        dialogLayout.addWidget(statusLabel);

        // 显示弹出框
        this.connectionDialog.show();

        try {
            if (this.config.type === 'TCP') {
                await this.client.connectTCP(this.config.host!, { port: this.config.port!, timeout: 5000 });
            } else {
                await this.client.connectRTUBuffered(this.config.serialPort!, {
                    baudRate: this.config.baudRate!,
                    dataBits: this.config.dataBits!,
                    stopBits: this.config.stopBits!,
                    parity: this.config.parity!
                });
            }

            this.isConnected = true;

            // 更新标签页状态点
            this.updateTabTitles();

            // 显示连接成功信息
            statusLabel.setText("连接成功！");
            statusLabel.setStyleSheet("font-size: 14px; padding: 20px; color: green;");

            // 更新菜单状态
            this.updateMenuState();

            // 启动连接检测
            this.startConnectionCheck();

            // 1秒后关闭弹出框
            setTimeout(() => {
                if (this.connectionDialog) {
                    this.connectionDialog.close();
                    this.connectionDialog = null;
                }
            }, 1000);

        } catch (error) {
            // 提取并格式化错误信息
            let errorMessage = "未知错误";
            if (error instanceof Error) {
                errorMessage = error.message;
            } else if (typeof error === 'string') {
                errorMessage = error;
            } else if (error && typeof error === 'object') {
                errorMessage = error.toString();
            }

            // 限制错误信息长度，确保完整显示
            if (errorMessage.length > 100) {
                errorMessage = errorMessage.substring(0, 97) + "...";
            }

            // 调整弹出框大小以适应错误信息
            this.connectionDialog.setFixedSize(350, 200);

            // 显示连接失败信息
            statusLabel.setText(`连接失败:\n${errorMessage}`);
            statusLabel.setStyleSheet("font-size: 12px; padding: 15px; color: red; word-wrap: break-word;");
            statusLabel.setWordWrap(true);

            // 添加关闭按钮
            const closeBtn = new QPushButton();
            closeBtn.setText("关闭");
            closeBtn.addEventListener('clicked', () => {
                if (this.connectionDialog) {
                    this.connectionDialog.close();
                    this.connectionDialog = null;
                }
            });
            dialogLayout.addWidget(closeBtn);
        }
    }

    private disconnect(): void {
        this.stopConnectionCheck();
        this.client.close(() => {
            this.isConnected = false;

            // 更新标签页状态点
            this.updateTabTitles();

            this.updateMenuState();
        });
    }

    private updateMenuState(): void {
        if (this.quickConnectAction && this.disconnectAction) {
            this.quickConnectAction.setEnabled(!this.isConnected);
            this.disconnectAction.setEnabled(this.isConnected);
        }
    }

    private createTabStatusIndicators(): void {
        if (!this.tabWidget) return;

        // 使用简单的文本方式在标签页标题中添加状态点
        this.updateTabTitles();
    }

    private updateTabTitles(): void {
        if (!this.tabWidget) return;

        // 主站状态：连接时显示小绿点，未连接时只显示文字
        const masterTitle = this.isConnected ? "主站功能 ●" : "主站功能";
        this.tabWidget.setTabText(0, masterTitle);

        // 从站状态：启动时显示小绿点，未启动时只显示文字
        const slaveTitle = this.isSlaveRunning ? "从站功能 ●" : "从站功能";
        this.tabWidget.setTabText(1, slaveTitle);
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
        readConfigGroup.setMaximumHeight(120); // 适当增加高度
        const readConfigLayout = new QBoxLayout(Direction.LeftToRight);
        readConfigLayout.setSpacing(10); // 增加间距
        readConfigLayout.setContentsMargins(12, 12, 12, 12); // 增加边距
        readConfigGroup.setLayout(readConfigLayout);

        // 控件尺寸优化
        const readSlaveIdLabel = new QLabel();
        readSlaveIdLabel.setFixedWidth(20);
        readSlaveIdLabel.setText("ID:"); // 简化标签文本
        const readSlaveIdSpin = new QSpinBox();
        readSlaveIdSpin.setRange(1, 247);
        readSlaveIdSpin.setValue(1);
        readSlaveIdSpin.setMaximumWidth(60); // 更小的宽度

        const readFunctionLabel = new QLabel();
        readFunctionLabel.setText("功能:");
        readFunctionLabel.setFixedWidth(30);
        const readFunctionCombo = new QComboBox();
        readFunctionCombo.addItems(["03-保持", "04-输入", "01-线圈", "02-离散"]); // 简化选项文本
        readFunctionCombo.setMaximumWidth(130);

        const readAddressLabel = new QLabel();
        readAddressLabel.setText("地址:");
        readAddressLabel.setFixedWidth(30);
        const readAddressSpin = new QSpinBox();
        readAddressSpin.setRange(0, 65535);
        readAddressSpin.setValue(0);

        const readLengthLabel = new QLabel();
        readLengthLabel.setText("长度:");
        readLengthLabel.setFixedWidth(30);
        const readLengthSpin = new QSpinBox();
        readLengthSpin.setRange(1, 125);
        readLengthSpin.setValue(20);
        readLengthSpin.setMaximumWidth(60);

        const readDataTypeLabel = new QLabel();
        readDataTypeLabel.setText("类型:");
        readDataTypeLabel.setFixedWidth(30);
        const readDataTypeCombo = new QComboBox();
        readDataTypeCombo.addItems(["Bool", "Int16", "UInt16", "Int32", "UInt32", "Float32", "Float64"]);
        readDataTypeCombo.setMaximumWidth(130);

        const readEndianLabel = new QLabel();
        readEndianLabel.setText("序:");
        readEndianLabel.setFixedWidth(20);
        const readEndianCombo = new QComboBox();
        readEndianCombo.addItems(["大端", "小端"]);
        readEndianCombo.setFixedWidth(100);

        const autoReadCheck = new QCheckBox();
        autoReadCheck.setMaximumWidth(80);
        autoReadCheck.setText("定时");

        const intervalSpin = new QSpinBox();
        intervalSpin.setRange(100, 10000);
        intervalSpin.setValue(1000);
        intervalSpin.setEnabled(false);
        intervalSpin.setMaximumWidth(100);
        intervalSpin.setSuffix("ms");

        const readBtn = new QPushButton();
        readBtn.setDefault(true);
        readBtn.setText("读取");
        readBtn.setFixedWidth(100);

        // 单行紧凑布局
        readConfigLayout.addWidget(readSlaveIdLabel);
        readConfigLayout.addWidget(readSlaveIdSpin);
        readConfigLayout.addWidget(readFunctionLabel);
        readConfigLayout.addWidget(readFunctionCombo);
        readConfigLayout.addWidget(readAddressLabel);
        readConfigLayout.addWidget(readAddressSpin);
        readConfigLayout.addWidget(readLengthLabel);
        readConfigLayout.addWidget(readLengthSpin);
        readConfigLayout.addWidget(readDataTypeLabel);
        readConfigLayout.addWidget(readDataTypeCombo);
        readConfigLayout.addWidget(readEndianLabel);
        readConfigLayout.addWidget(readEndianCombo);
        readConfigLayout.addWidget(autoReadCheck);
        readConfigLayout.addWidget(intervalSpin);
        readConfigLayout.addWidget(readBtn);

        // 写入配置区域
        const writeConfigGroup = new QGroupBox();
        writeConfigGroup.setTitle("写入配置");
        writeConfigGroup.setCheckable(true);
        writeConfigGroup.setChecked(true);
        writeConfigGroup.setMaximumHeight(100); // 适当增加高度
        const writeConfigLayout = new QBoxLayout(Direction.LeftToRight);
        writeConfigLayout.setSpacing(10);
        writeConfigLayout.setContentsMargins(12, 12, 12, 12);
        writeConfigGroup.setLayout(writeConfigLayout);

        // 写入控件优化
        const writeSlaveIdLabel = new QLabel();
        writeSlaveIdLabel.setText("ID:");
        writeSlaveIdLabel.setFixedWidth(20);
        const writeSlaveIdSpin = new QSpinBox();
        writeSlaveIdSpin.setValue(1);
        writeSlaveIdSpin.setFixedWidth(80);

        const writeFunctionLabel = new QLabel();
        writeFunctionLabel.setText("功能:");
        writeFunctionLabel.setFixedWidth(30);
        const writeFunctionCombo = new QComboBox();
        writeFunctionCombo.addItems(["06-单寄存器", "16-多寄存器", "05-单线圈", "15-多线圈"]);

        const writeAddressLabel = new QLabel();
        writeAddressLabel.setText("地址:");
        writeAddressLabel.setFixedWidth(30);
        const writeAddressSpin = new QSpinBox();
        writeAddressSpin.setValue(0);
        writeAddressSpin.setFixedWidth(100);

        const writeValueLabel = new QLabel();
        writeValueLabel.setText("值:");
        writeValueLabel.setFixedWidth(20);
        const writeValueEdit = new QDoubleSpinBox();
        writeValueEdit.setValue(0);
        writeValueEdit.setDecimals(6);
        writeValueEdit.setMinimum(-2147483648);
        writeValueEdit.setMaximum(2147483647);

        const writeDataTypeLabel = new QLabel();
        writeDataTypeLabel.setText("类型:");
        writeDataTypeLabel.setFixedWidth(30);
        const writeDataTypeCombo = new QComboBox();
        writeDataTypeCombo.setFixedWidth(120);
        writeDataTypeCombo.addItems(["Bool", "Int16", "UInt16", "Int32", "UInt32", "Float32", "Float64"]);

        // 为写入值输入框设置数据类型范围验证
        const updateWriteValueRange = () => {
            const dataType = writeDataTypeCombo.currentText();
            console.log(dataType);
            switch (dataType) {
                case "Bool":
                    writeValueEdit.setMinimum(0);
                    writeValueEdit.setMaximum(1);
                    writeValueEdit.setDecimals(0);
                    break;
                case "Int16":
                    writeValueEdit.setMinimum(-32768);
                    writeValueEdit.setMaximum(32767);
                    writeValueEdit.setDecimals(0);
                    break;
                case "UInt16":
                    writeValueEdit.setMinimum(0);
                    writeValueEdit.setMaximum(65535);
                    writeValueEdit.setDecimals(0);
                    break;
                case "Int32":
                    writeValueEdit.setMinimum(-2147483648);
                    writeValueEdit.setMaximum(2147483647);
                    writeValueEdit.setDecimals(0);
                    break;
                case "UInt32":
                    writeValueEdit.setMinimum(0);
                    writeValueEdit.setMaximum(4294967295);
                    writeValueEdit.setDecimals(0);
                    break;
                case "Float32":
                    writeValueEdit.setMinimum(-1000000000);
                    writeValueEdit.setMaximum(1000000000);
                    writeValueEdit.setDecimals(6);
                    break;
                case "Float64":
                    writeValueEdit.setMinimum(-1000000000);
                    writeValueEdit.setMaximum(1000000000);
                    writeValueEdit.setDecimals(6);
                    break;
                default:
                    writeValueEdit.setMinimum(-2147483648);
                    writeValueEdit.setMaximum(2147483647);
                    writeValueEdit.setDecimals(0);
            }
        };
        writeDataTypeCombo.addEventListener('currentTextChanged', updateWriteValueRange);
        // 初始设置范围
        updateWriteValueRange();




        const writeBtn = new QPushButton();
        writeBtn.setText("写入");
        writeBtn.setFixedWidth(100);
        writeBtn.setDefault(true);

        // 单行布局
        writeConfigLayout.addWidget(writeSlaveIdLabel);
        writeConfigLayout.addWidget(writeSlaveIdSpin);
        writeConfigLayout.addWidget(writeFunctionLabel);
        writeConfigLayout.addWidget(writeFunctionCombo);
        writeConfigLayout.addWidget(writeAddressLabel);
        writeConfigLayout.addWidget(writeAddressSpin);
        writeConfigLayout.addWidget(writeDataTypeLabel);
        writeConfigLayout.addWidget(writeDataTypeCombo);
        writeConfigLayout.addWidget(writeValueLabel);
        writeConfigLayout.addWidget(writeValueEdit);

        writeConfigLayout.addWidget(writeBtn);

        // 数据显示表格区域
        const dataDisplayGroup = new QGroupBox();
        dataDisplayGroup.setTitle("数据显示");
        const dataDisplayLayout = new QBoxLayout(Direction.TopToBottom);
        dataDisplayGroup.setLayout(dataDisplayLayout);

        const dataTable = new QScrollArea();
        dataTable.setWidgetResizable(true);

        dataTable.setStyleSheet("QScrollArea { border: 1px solid #ccc; background-color: white; }");

        const dataWidget = new QWidget();
        const dataGridLayout = new QGridLayout();
        dataWidget.setLayout(dataGridLayout);
        dataTable.setWidget(dataWidget);

        // 初始化默认表格显示
        const initializeDefaultDataTable = () => {
            // 清空现有内容
            const newDataWidget = new QWidget();
            const colBoxLayout = new QBoxLayout(Direction.TopToBottom);
            colBoxLayout.setSpacing(0);
            colBoxLayout.setContentsMargins(0, 0, 0, 0);

            newDataWidget.setLayout(colBoxLayout);

            const pairsPerRow = 6;
            const defaultCount = 20; // 默认显示10个地址
            const rows = Math.ceil(defaultCount / pairsPerRow);

            const rowBoxLayout = new QBoxLayout(Direction.LeftToRight)
            // 添加标题行
            for (let col = 0; col < pairsPerRow; col++) {
                const addrHeaderLabel = new QLabel();
                addrHeaderLabel.setFixedHeight(40)
                addrHeaderLabel.setText(`地址`);
                addrHeaderLabel.setStyleSheet("font-weight: bold; color: #333333; border-bottom: 1px solid #ccc;border-right: 1px solid #ccc; padding: 5px; background-color: #f5f5f5;");

                const valueHeaderLabel = new QLabel();
                valueHeaderLabel.setFixedHeight(40)
                valueHeaderLabel.setFixedWidth(120)
                valueHeaderLabel.setText(`值`);
                valueHeaderLabel.setStyleSheet("font-weight: bold; color: #333333; border-bottom: 1px solid #ccc;border-right: 1px solid #ccc; padding: 5px; background-color: #f5f5f5;");

                rowBoxLayout.addWidget(addrHeaderLabel)
                rowBoxLayout.addWidget(valueHeaderLabel)
            }
            colBoxLayout.addLayout(rowBoxLayout)

            // 填充默认数据
            for (let row = 0; row < rows; row++) {
                const rowBoxLayout = new QBoxLayout(Direction.LeftToRight)
                for (let col = 0; col < pairsPerRow; col++) {
                    const addr = row * pairsPerRow + col;

                    // 创建地址标签
                    const addressLabel = new QLabel();
                    addressLabel.setFixedHeight(40)
                    addressLabel.setText(addr > defaultCount ? "" : addr.toString());
                    addressLabel.setStyleSheet("padding: 5px; color: #555555; border-bottom: 1px solid #ccc;border-right: 1px solid #ccc; background-color: #fafafa;");
                    rowBoxLayout.addWidget(addressLabel)

                    // 创建值标签
                    const valueLabel = new QLabel();
                    valueLabel.setFixedHeight(40)
                    valueLabel.setFixedWidth(120)
                    valueLabel.setText(addr > defaultCount ? "" : "--");
                    valueLabel.setStyleSheet("padding: 5px; color: #888888; border-bottom: 1px solid #ccc;border-right: 1px solid #ccc; background-color: #f8f8f8;");
                    rowBoxLayout.addWidget(valueLabel)
                }

                colBoxLayout.addLayout(rowBoxLayout)
            }

            colBoxLayout.addStretch(1);
            dataTable.setWidget(newDataWidget);
        };

        // 初始化默认表格
        initializeDefaultDataTable();

        dataDisplayLayout.addWidget(dataTable);

        // 主站操作日志
        this.masterLogGroup = new QGroupBox();
        this.masterLogGroup.setTitle("操作日志 ");
        this.masterLogGroup.setCheckable(true);
        this.masterLogGroup.setChecked(true);

        const logLayout = new QBoxLayout(Direction.TopToBottom);
        this.masterLogGroup.setLayout(logLayout);

        this.masterLogText = new QTextEdit();
        this.masterLogText.setReadOnly(true);
        this.masterLogText.setMinimumHeight(150);
        this.masterLogText.setMaximumHeight(300);
        this.masterLogText.setStyleSheet("font-family: 'Courier New', monospace; font-size: 12px; background-color: #f8f8f8;");
        logLayout.addWidget(this.masterLogText);

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
            autoReadCheck.setVisible(!readConfigCollapsed);
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

        this.masterLogGroup.addEventListener('clicked', () => {
            logCollapsed = !logCollapsed;
            this.masterLogGroup.setTitle(logCollapsed ? "操作日志" : "操作日志 ");
            this.masterLogText!.setVisible(!logCollapsed);
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
            const colBoxLayout = new QBoxLayout(Direction.TopToBottom);
            colBoxLayout.setSpacing(0);
            colBoxLayout.setContentsMargins(0, 0, 0, 0);

            newDataWidget.setLayout(colBoxLayout);

            const pairsPerRow = 6; // 每行显示6对地址-值，与从站保持一致
            const count = data.length;
            const rows = Math.ceil(count / pairsPerRow);

            const headerRowBoxLayout = new QBoxLayout(Direction.LeftToRight);
            // 添加标题行
            for (let col = 0; col < pairsPerRow; col++) {
                const addrHeaderLabel = new QLabel();
                addrHeaderLabel.setFixedHeight(40);
                addrHeaderLabel.setText(`地址`);
                addrHeaderLabel.setStyleSheet("font-weight: bold; color: #333333; border-bottom: 1px solid #ccc;border-right: 1px solid #ccc; padding: 5px; background-color: #f5f5f5;");

                const valueHeaderLabel = new QLabel();
                valueHeaderLabel.setFixedHeight(40);
                valueHeaderLabel.setFixedWidth(120);
                valueHeaderLabel.setText(`值`);
                valueHeaderLabel.setStyleSheet("font-weight: bold; color: #333333; border-bottom: 1px solid #ccc;border-right: 1px solid #ccc; padding: 5px; background-color: #f5f5f5;");

                headerRowBoxLayout.addWidget(addrHeaderLabel);
                headerRowBoxLayout.addWidget(valueHeaderLabel);

                currentDataLabels.push(addrHeaderLabel);
                currentDataLabels.push(valueHeaderLabel);
            }
            colBoxLayout.addLayout(headerRowBoxLayout);

            // 填充数据
            for (let row = 0; row < rows; row++) {
                const rowBoxLayout = new QBoxLayout(Direction.LeftToRight);
                for (let col = 0; col < pairsPerRow; col++) {
                    const index = row * pairsPerRow + col;
                    if (index >= count) {
                        // 创建空的地址标签
                        const addressLabel = new QLabel();
                        addressLabel.setFixedHeight(40);
                        addressLabel.setText("");
                        addressLabel.setStyleSheet("padding: 5px; color: #555555; border-bottom: 1px solid #ccc;border-right: 1px solid #ccc; background-color: #fafafa;");
                        rowBoxLayout.addWidget(addressLabel);

                        // 创建空的值标签
                        const valueLabel = new QLabel();
                        valueLabel.setFixedHeight(40);
                        valueLabel.setFixedWidth(120);
                        valueLabel.setText("");
                        valueLabel.setStyleSheet("padding: 5px; color: #888888; border-bottom: 1px solid #ccc;border-right: 1px solid #ccc; background-color: #f8f8f8;");
                        rowBoxLayout.addWidget(valueLabel);
                        continue;
                    }

                    const addr = address + index;

                    // 创建地址标签
                    const addressLabel = new QLabel();
                    addressLabel.setFixedHeight(40);
                    addressLabel.setText(addr.toString());
                    addressLabel.setStyleSheet("padding: 5px; color: #555555; border-bottom: 1px solid #ccc;border-right: 1px solid #ccc; background-color: #fafafa;");
                    rowBoxLayout.addWidget(addressLabel);
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
                    valueLabel.setFixedHeight(40);
                    valueLabel.setFixedWidth(120);

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

                    rowBoxLayout.addWidget(valueLabel);
                    currentDataLabels.push(valueLabel);
                }
                colBoxLayout.addLayout(rowBoxLayout);
            }

            colBoxLayout.addStretch(1);
            // 更新滚动区域的widget
            dataTable.setWidget(newDataWidget);
        };

        // 清空日志按钮事件
        clearLogBtn.addEventListener('clicked', () => {
            this.masterLogText!.clear();
        });

        // 读取数据事件处理
        readBtn.addEventListener('clicked', async () => {
            if (!this.isConnected) {
                this.masterLogText!.append(`[${new Date().toLocaleTimeString()}] 错误: 请先连接到Modbus设备\n`);
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

                this.masterLogText!.append(`[${new Date().toLocaleTimeString()}] 读取数据: ${functionText}, 从站ID: ${readSlaveIdSpin.value()},  地址: ${address}, 长度: ${length}\n`);

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
                this.masterLogText!.append(`[${new Date().toLocaleTimeString()}] 读取成功 - 数据: ${formattedData}\n\n`);
            } catch (error) {
                this.masterLogText!.append(`[${new Date().toLocaleTimeString()}] 读取失败: ${error}\n\n`);
            }
        });

        // 写入数据事件处理
        writeBtn.addEventListener('clicked', async () => {
            if (!this.isConnected) {
                this.masterLogText!.append(`[${new Date().toLocaleTimeString()}] 错误: 请先连接到Modbus设备\n`);
                return;
            }

            try {
                this.client.setID(writeSlaveIdSpin.value());
                const address = writeAddressSpin.value();
                const valueText = writeValueEdit.value().toString();
                const functionCode = writeFunctionCombo.currentIndex();
                const functionText = writeFunctionCombo.currentText();
                const dataType = writeDataTypeCombo.currentText();

                // 验证输入值范围
                if (!this.validateInputValue(valueText, dataType)) {
                    this.masterLogText!.append(`[${new Date().toLocaleTimeString()}] 错误: 输入值 "${valueText}" 超出 ${dataType} 类型的有效范围\n`);
                    return;
                }

                this.masterLogText!.append(`[${new Date().toLocaleTimeString()}] 写入数据: ${functionText}, 从站ID: ${writeSlaveIdSpin.value()}, 地址: ${address}, 值: ${valueText}\n`);

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

                this.masterLogText!.append(`[${new Date().toLocaleTimeString()}] 写入成功\n\n`);
            } catch (error) {
                this.masterLogText!.append(`[${new Date().toLocaleTimeString()}] 写入失败: ${error}\n\n`);
            }
        })
        layout.addWidget(readConfigGroup);
        layout.addWidget(writeConfigGroup);
        layout.addWidget(dataDisplayGroup);

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
        slaveGroup.setMaximumHeight(90); // 适当增加高度
        const slaveLayout = new QBoxLayout(Direction.LeftToRight);
        slaveLayout.setSpacing(10);
        slaveLayout.setContentsMargins(12, 12, 12, 12);
        slaveGroup.setLayout(slaveLayout);

        const slavePortLabel = new QLabel();
        slavePortLabel.setText("端口:");
        slavePortLabel.setFixedWidth(50);

        const slavePortSpin = new QSpinBox();
        slavePortSpin.setRange(0, 65535);
        slavePortSpin.setValue(502);

        const slaveIdLabel = new QLabel();
        slaveIdLabel.setText("ID:");
        slaveIdLabel.setFixedWidth(50);
        const slaveIdSpin = new QSpinBox();
        slaveIdSpin.setValue(1);

        const startSlaveBtn = new QPushButton();
        startSlaveBtn.setText("启动");
        startSlaveBtn.setDefault(true);

        const stopSlaveBtn = new QPushButton();
        stopSlaveBtn.setText("停止");
        stopSlaveBtn.setEnabled(false);

        // 单行布局
        slaveLayout.addWidget(slavePortLabel);
        slaveLayout.addWidget(slavePortSpin);
        slaveLayout.addWidget(slaveIdLabel);
        slaveLayout.addWidget(slaveIdSpin);
        slaveLayout.addWidget(startSlaveBtn);
        slaveLayout.addWidget(stopSlaveBtn);

        // 显示配置区域
        const displayGroup = new QGroupBox();
        displayGroup.setTitle("显示配置 ");
        displayGroup.setCheckable(true);
        displayGroup.setChecked(true);
        displayGroup.setMaximumHeight(120); // 适当增加高度
        const displayLayout = new QBoxLayout(Direction.LeftToRight);
        displayLayout.setSpacing(10);
        displayLayout.setContentsMargins(12, 12, 12, 12);
        displayGroup.setLayout(displayLayout);

        // 显示配置控件优化
        const startAddrLabel = new QLabel();
        startAddrLabel.setText("地址:");
        const startAddrSpin = new QSpinBox();
        startAddrLabel.setFixedWidth(50);
        startAddrSpin.setValue(0);

        const countLabel = new QLabel();
        countLabel.setText("数量:");
        countLabel.setFixedWidth(50);
        const countSpin = new QSpinBox();
        countSpin.setValue(20);

        const displayTypeLabel = new QLabel();
        displayTypeLabel.setText("类型:");
        displayTypeLabel.setFixedWidth(50);
        const displayTypeCombo = new QComboBox();
        displayTypeCombo.addItems(["Bool", "Int16", "UInt16", "Int32", "UInt32", "Float32", "Float64"]);
        displayTypeCombo.setFixedWidth(130);

        const endianLabel = new QLabel();
        endianLabel.setText("序:");
        endianLabel.setFixedWidth(20);
        const endianCombo = new QComboBox();
        endianCombo.addItems(["大端", "小端"]);
        endianCombo.setFixedWidth(100);

        const autoRefreshCheck = new QCheckBox();
        autoRefreshCheck.setText("自动");
        autoRefreshCheck.setFixedWidth(50);

        const refreshIntervalSpin = new QSpinBox();
        refreshIntervalSpin.setValue(1000);
        refreshIntervalSpin.setEnabled(false);
        refreshIntervalSpin.setSuffix("ms");

        const refreshBtn = new QPushButton();
        refreshBtn.setText("刷新");
        refreshBtn.setDefault(true);
        refreshBtn.setFixedWidth(100);

        // 单行布局
        displayLayout.addWidget(startAddrLabel);
        displayLayout.addWidget(startAddrSpin);
        displayLayout.addWidget(countLabel);
        displayLayout.addWidget(countSpin);
        displayLayout.addWidget(displayTypeLabel);
        displayLayout.addWidget(displayTypeCombo);
        displayLayout.addWidget(endianLabel);
        displayLayout.addWidget(endianCombo);
        displayLayout.addWidget(autoRefreshCheck);
        displayLayout.addWidget(refreshIntervalSpin);
        displayLayout.addWidget(refreshBtn);


        // 数据写入区域
        const writeGroup = new QGroupBox();
        writeGroup.setTitle("数据写入 ");
        writeGroup.setCheckable(true);
        writeGroup.setChecked(true);
        writeGroup.setMaximumHeight(100);
        const writeLayout = new QBoxLayout(Direction.LeftToRight);
        writeLayout.setSpacing(15);
        writeLayout.setContentsMargins(12, 12, 12, 12);
        writeGroup.setLayout(writeLayout);
        const writeAddrLabel = new QLabel();
        writeAddrLabel.setFixedWidth(65);
        writeAddrLabel.setText("写入地址:");
        const writeAddrInput = new QSpinBox();
        writeAddrInput.setMinimum(0);
        writeAddrInput.setMaximum(65535);
        writeAddrInput.setFixedWidth(130);

        const writeTypeLabel = new QLabel();
        writeTypeLabel.setText("数据类型:");
        writeTypeLabel.setFixedWidth(65);

        const writeTypeCombo = new QComboBox();
        writeTypeCombo.addItems(["UInt16", "UInt16", "Bool", "Int16", "Int32", "UInt32", "Float32", "Float64"]);
        writeTypeCombo.setMaximumWidth(150);

        const writeEndianLabel = new QLabel();
        writeEndianLabel.setText("字节序:");
        writeEndianLabel.setFixedWidth(50);
        const writeEndianCombo = new QComboBox();
        writeEndianCombo.addItems(["大端", "小端"]);
        writeEndianCombo.setMaximumWidth(150);

        const writeValueLabel = new QLabel();
        writeValueLabel.setText("值:");
        writeValueLabel.setFixedWidth(20);
        const writeValueInput = new QDoubleSpinBox();
        writeValueInput.setValue(0);
        writeValueInput.setDecimals(6);
        writeValueInput.setMinimum(-2147483648);
        writeValueInput.setMaximum(2147483647);

        // 为写入值输入框设置数据类型范围验证
        const updateSlaveWriteValueRange = () => {
            const dataType = writeTypeCombo.currentText();
            switch (dataType) {
                case "Bool":
                    writeValueInput.setMinimum(0);
                    writeValueInput.setMaximum(1);
                    writeValueInput.setDecimals(0);

                    break;
                case "Int16":
                    writeValueInput.setMinimum(-32768);
                    writeValueInput.setMaximum(32767);
                    writeValueInput.setDecimals(0);

                    break;
                case "UInt16":
                    writeValueInput.setMinimum(0);
                    writeValueInput.setMaximum(65535);
                    writeValueInput.setDecimals(0);

                    break;
                case "Int32":
                    writeValueInput.setMinimum(-2147483648);
                    writeValueInput.setMaximum(2147483647);
                    writeValueInput.setDecimals(0);

                    break;
                case "UInt32":
                    writeValueInput.setMinimum(0);
                    writeValueInput.setMaximum(4294967295);
                    writeValueInput.setDecimals(0);

                    break;
                case "Float32":
                    writeValueInput.setMinimum(-1000000000);
                    writeValueInput.setMaximum(1000000000);  // 添加分号
                    writeValueInput.setDecimals(6);
                    break;
                case "Float64":
                    writeValueInput.setMinimum(-1000000000);
                    writeValueInput.setMaximum(1000000000);  // 添加分号
                    writeValueInput.setDecimals(6);
                    break;
                default:
                    writeValueInput.setMinimum(-2147483648);
                    writeValueInput.setMaximum(2147483647);
                    writeValueInput.setDecimals(0);

            }
        };

        // 初始设置范围
        updateSlaveWriteValueRange();

        // 监听数据类型变化
        writeTypeCombo.addEventListener('currentTextChanged', updateSlaveWriteValueRange);

        const writeBtn = new QPushButton();
        writeBtn.setText("写入");
        writeBtn.setFixedWidth(100);
        writeBtn.setDefault(true);

        writeLayout.addWidget(writeAddrLabel);
        writeLayout.addWidget(writeAddrInput);
        writeLayout.addWidget(writeTypeLabel);
        writeLayout.addWidget(writeTypeCombo);
        writeLayout.addWidget(writeEndianLabel);
        writeLayout.addWidget(writeEndianCombo);
        writeLayout.addWidget(writeValueLabel);
        writeLayout.addWidget(writeValueInput);
        writeLayout.addWidget(writeBtn);

        // 统一写入按钮事件
        writeBtn.addEventListener('clicked', () => {
            const address = parseInt(writeAddrInput.text()) || 0;
            const dataType = writeTypeCombo.currentIndex();
            const inputValue = writeValueInput.value().toString();
            const isLittleEndian = writeEndianCombo.currentIndex() === 1;
            const dataTypeName = writeTypeCombo.currentText();

            if (address < 0 || address >= 65536) {
                this.slaveLogText!.append(`地址错误: ${address} (需要0-65535)\n`);
                return;
            }

            // 验证输入值范围
            if (!this.validateInputValue(inputValue, dataTypeName)) {
                this.slaveLogText!.append(`输入值错误: "${inputValue}" 超出 ${dataTypeName} 类型的有效范围\n`);
                return;
            }

            switch (dataType) {
                case 0: // 保持寄存器(UInt16)
                    const holdingValue = parseInt(inputValue) || 0;
                    holdingRegisters[address] = holdingValue;
                    this.slaveLogText!.append(`写入保持寄存器: 地址=${address}, 值=${holdingValue}\n`);
                    break;

                case 1: // 输入寄存器(UInt16)
                    const inputRegValue = parseInt(inputValue) || 0;
                    inputRegisters[address] = inputRegValue;
                    this.slaveLogText!.append(`写入输入寄存器: 地址=${address}, 值=${inputRegValue}\n`);
                    break;

                case 2: // 线圈(Bool)
                    const coilValue = inputValue.toLowerCase() === 'true' || inputValue === '1';
                    coils[address] = coilValue;
                    this.slaveLogText!.append(`写入线圈: 地址=${address}, 值=${coilValue}\n`);
                    break;

                case 3: // Int16
                    const int16Value = parseInt(inputValue) || 0;
                    holdingRegisters[address] = int16Value < 0 ? 65536 + int16Value : int16Value;
                    this.slaveLogText!.append(`写入Int16: 地址=${address}, 值=${int16Value}\n`);
                    break;

                case 4: // Int32
                    const int32Value = parseInt(inputValue) || 0;
                    if (address < 65535) {
                        const uint32Value = int32Value < 0 ? 4294967296 + int32Value : int32Value;
                        if (isLittleEndian) {
                            holdingRegisters[address] = uint32Value & 0xFFFF;
                            holdingRegisters[address + 1] = (uint32Value >> 16) & 0xFFFF;
                        } else {
                            holdingRegisters[address] = (uint32Value >> 16) & 0xFFFF;
                            holdingRegisters[address + 1] = uint32Value & 0xFFFF;
                        }
                        this.slaveLogText!.append(`写入Int32: 地址=${address}, 值=${int32Value}\n`);
                    } else {
                        this.slaveLogText!.append(`Int32地址不足: ${address} (需要连续2个寄存器)\n`);
                    }
                    break;

                case 5: // UInt32
                    const uint32Value = parseInt(inputValue) || 0;
                    if (address < 65535) {
                        if (isLittleEndian) {
                            holdingRegisters[address] = uint32Value & 0xFFFF;
                            holdingRegisters[address + 1] = (uint32Value >> 16) & 0xFFFF;
                        } else {
                            holdingRegisters[address] = (uint32Value >> 16) & 0xFFFF;
                            holdingRegisters[address + 1] = uint32Value & 0xFFFF;
                        }
                        this.slaveLogText!.append(`写入UInt32: 地址=${address}, 值=${uint32Value}\n`);
                    } else {
                        this.slaveLogText!.append(`UInt32地址不足: ${address} (需要连续2个寄存器)\n`);
                    }
                    break;

                case 6: // Float32
                    const float32Value = parseFloat(inputValue) || 0;
                    if (address < 65535) {
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
                        this.slaveLogText!.append(`写入Float32: 地址=${address}, 值=${float32Value}\n`);
                    } else {
                        this.slaveLogText!.append(`Float32地址不足: ${address} (需要连续2个寄存器)\n`);
                    }
                    break;

                case 7: // Float64
                    const float64Value = parseFloat(inputValue) || 0;
                    if (address < 65533) {
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
                        this.slaveLogText!.append(`写入Float64: 地址=${address}, 值=${float64Value}\n`);
                    } else {
                        this.slaveLogText!.append(`Float64地址不足: ${address} (需要连续4个寄存器)\n`);
                    }
                    break;
            }

            // 刷新表格显示
            initializeTable();
            writeValueInput.setValue(0);
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
        scrollArea.setMinimumHeight(400);
        scrollArea.setMaximumHeight(700);

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
            const colBoxLayout = new QBoxLayout(Direction.TopToBottom);
            colBoxLayout.setSpacing(0);
            colBoxLayout.setContentsMargins(0, 0, 0, 0);

            newScrollWidget.setLayout(colBoxLayout);
            scrollArea.setWidget(newScrollWidget);

            // 计算行数
            const rows = Math.ceil(count / pairsPerRow);

            const headerRowBoxLayout = new QBoxLayout(Direction.LeftToRight);
            // 添加标题行
            for (let col = 0; col < pairsPerRow; col++) {
                const addrHeaderLabel = new QLabel();
                addrHeaderLabel.setFixedHeight(40);
                addrHeaderLabel.setText(`地址`);
                addrHeaderLabel.setStyleSheet("font-weight: bold; color: #333333; border-bottom: 1px solid #ccc;border-right: 1px solid #ccc; padding: 5px; background-color: #f5f5f5;");

                const valueHeaderLabel = new QLabel();
                valueHeaderLabel.setFixedHeight(40);
                valueHeaderLabel.setFixedWidth(120)
                valueHeaderLabel.setText(`值`);
                valueHeaderLabel.setStyleSheet("font-weight: bold; color: #333333; border-bottom: 1px solid #ccc;border-right: 1px solid #ccc; padding: 5px; background-color: #f5f5f5;");

                headerRowBoxLayout.addWidget(addrHeaderLabel);
                headerRowBoxLayout.addWidget(valueHeaderLabel);

                addressLabels.push(addrHeaderLabel);
                valueLabels.push(valueHeaderLabel);
            }
            colBoxLayout.addLayout(headerRowBoxLayout);

            // 填充数据
            for (let row = 0; row < rows; row++) {
                const rowBoxLayout = new QBoxLayout(Direction.LeftToRight);
                for (let col = 0; col < pairsPerRow; col++) {
                    const index = row * pairsPerRow + col;
                    if (index >= count) {
                        // 创建空的地址标签
                        const addressLabel = new QLabel();
                        addressLabel.setFixedHeight(40);
                        addressLabel.setText("");
                        addressLabel.setStyleSheet("padding: 5px; color: #555555; border-bottom: 1px solid #ccc;border-right: 1px solid #ccc; background-color: #fafafa;");
                        rowBoxLayout.addWidget(addressLabel);

                        // 创建空的值标签
                        const valueLabel = new QLabel();
                        valueLabel.setFixedHeight(40);
                        valueLabel.setFixedWidth(120)
                        valueLabel.setText("");
                        valueLabel.setStyleSheet("padding: 5px; color: #888888; border-bottom: 1px solid #ccc;border-right: 1px solid #ccc; background-color: #f8f8f8;");
                        rowBoxLayout.addWidget(valueLabel);
                        continue;
                    }

                    const addr = startAddr + index;

                    // 创建地址标签
                    const addressLabel = new QLabel();
                    addressLabel.setFixedHeight(40);
                    addressLabel.setText(addr.toString());
                    addressLabel.setStyleSheet("padding: 5px; color: #555555; border-bottom: 1px solid #ccc;border-right: 1px solid #ccc; background-color: #fafafa;");
                    rowBoxLayout.addWidget(addressLabel);
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
                    valueLabel.setFixedHeight(40);
                    valueLabel.setFixedWidth(120)

                    // 如果是多寄存器数据类型的第二个及后续寄存器，显示'-'
                    if (isSecondaryRegister) {
                        valueLabel.setText("-");
                        valueLabel.setStyleSheet("padding: 5px; color: #888888; border-bottom: 1px solid #ccc;border-right: 1px solid #ccc; background-color: #f8f8f8;");
                    } else {
                        // 根据显示类型计算值，显示默认值或实际值
                        let displayValue = "--";
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
                                        displayValue = buffer.readFloatBE(0).toFixed(4);
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
                                        displayValue = buffer.readDoubleBE(0).toFixed(4);
                                    }
                                    break;
                            }
                        } catch (e) {
                            displayValue = "错误";
                        }

                        valueLabel.setText(displayValue);
                        valueLabel.setStyleSheet("padding: 5px; color: #000000; background-color: #f8f8f8; border-bottom: 1px solid #ccc;border-right: 1px solid #ccc;");
                    }

                    rowBoxLayout.addWidget(valueLabel);
                    valueLabels.push(valueLabel);
                }
                colBoxLayout.addLayout(rowBoxLayout);
            }

            colBoxLayout.addStretch(1);
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
            autoRefreshCheck.setVisible(checked);
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
            this.masterLogText!.append("表格已手动刷新\n");
        });

        // 自动刷新控制
        autoRefreshCheck.addEventListener('toggled', (checked) => {
            refreshIntervalSpin.setEnabled(checked);
            if (checked) {
                startAutoRefresh();
                this.masterLogText!.append(`自动刷新已启用，间隔${refreshIntervalSpin.value()}ms\n`);
            } else {
                stopAutoRefresh();
                this.masterLogText!.append("自动刷新已停用\n");
            }
        });

        // 刷新间隔变化时重启定时器
        refreshIntervalSpin.addEventListener('valueChanged', () => {
            if (autoRefreshCheck.isChecked()) {
                startAutoRefresh();
                this.masterLogText!.append(`刷新间隔已更新为${refreshIntervalSpin.value()}ms\n`);
            }
        });

        // 配置变化时自动刷新
        startAddrSpin.addEventListener('valueChanged', () => initializeTable());
        countSpin.addEventListener('valueChanged', () => initializeTable());
        displayTypeCombo.addEventListener('currentTextChanged', () => initializeTable());
        endianCombo.addEventListener('currentIndexChanged', () => initializeTable());

        // 日志显示
        this.slaveLogGroup = new QGroupBox();
        this.slaveLogGroup.setTitle("运行日志 ");
        this.slaveLogGroup.setCheckable(true);
        this.slaveLogGroup.setChecked(true);
        const logLayout = new QBoxLayout(Direction.TopToBottom);
        this.slaveLogGroup.setLayout(logLayout);

        this.slaveLogText = new QTextEdit();
        this.slaveLogText.setReadOnly(true);
        this.slaveLogText.setMaximumHeight(120);
        logLayout.addWidget(this.slaveLogText);

        // 添加日志组件的折叠事件监听器
        this.slaveLogGroup.addEventListener('toggled', (checked) => {
            this.slaveLogGroup.setTitle(checked ? "运行日志 " : "运行日志");
            // 手动控制子组件的可见性
            this.slaveLogText!.setVisible(checked);
        });


        // 网格布局已通过scrollArea添加

        // 从站日志显示
        this.slaveLogGroup = new QGroupBox();
        this.slaveLogGroup.setTitle("从站日志 ");
        this.slaveLogGroup.setCheckable(true);
        this.slaveLogGroup.setChecked(true);

        const slaveLogLayout = new QBoxLayout(Direction.TopToBottom);
        this.slaveLogGroup.setLayout(slaveLogLayout);

        slaveLogLayout.addWidget(this.slaveLogText!);

        // 添加从站日志组件的折叠事件监听器
        this.slaveLogGroup.addEventListener('toggled', (checked) => {
            this.slaveLogGroup!.setTitle(checked ? "从站日志 " : "从站日志");
            // 手动控制子组件的可见性
            this.slaveLogText!.setVisible(checked);
        });

        // 事件处理
        startSlaveBtn.addEventListener('clicked', () => {
            const port = slavePortSpin.value();
            const slaveId = slaveIdSpin.value(); // 获取配置的从站ID

            // 创建Modbus向量对象，定义从站的数据处理方法
            const vector = {
                // 读取线圈状态 (FC01)
                getCoil: (addr: number, unitID: number) => {
                    this.slaveLogText!.append(`读取线圈: 地址=${addr}, 单元ID=${unitID}\n`);
                    return coils[addr] || false;
                },

                // 读取离散输入状态 (FC02)
                getDiscreteInput: (addr: number, unitID: number) => {
                    this.slaveLogText!.append(`读取离散输入: 地址=${addr}, 单元ID=${unitID}\n`);
                    return coils[addr] || false; // 使用相同的数组
                },

                // 读取保持寄存器 (FC03)
                getHoldingRegister: (addr: number, unitID: number) => {
                    this.slaveLogText!.append(`读取保持寄存器: 地址=${addr}, 单元ID=${unitID}\n`);
                    return holdingRegisters[addr] || 0;
                },

                // 读取输入寄存器 (FC04)
                getInputRegister: (addr: number, unitID: number) => {
                    this.slaveLogText!.append(`读取输入寄存器: 地址=${addr}, 单元ID=${unitID}\n`);
                    return inputRegisters[addr] || 0;
                },

                // 写入单个线圈 (FC05)
                setCoil: (addr: number, value: boolean, unitID: number) => {
                    this.slaveLogText!.append(`写入线圈: 地址=${addr}, 值=${value}, 单元ID=${unitID}\n`);
                    coils[addr] = value;
                    return true;
                },

                // 写入单个寄存器 (FC06)
                setRegister: (addr: number, value: number, unitID: number) => {
                    this.slaveLogText!.append(`写入寄存器: 地址=${addr}, 值=${value}, 单元ID=${unitID}\n`);
                    holdingRegisters[addr] = value;
                    return true;
                }
            };

            // console.log(slaveId);

            // 创建Modbus TCP服务器
            this.modbusServer = new ServerTCP(vector, {
                host: '0.0.0.0',
                port: port,
                unitID: slaveId
            });

            // 监听错误事件
            this.modbusServer.on('error', (err) => {
                this.slaveLogText!.append(`服务器错误: ${err.message}\n`);
            });

            this.modbusServer.on('initialized', () => {
                this.slaveLogText!.append(`Modbus服务器已初始化\n`);
            });

            // 启动服务器
            this.slaveLogText!.append(`从站启动，监听端口: ${port}, 单元ID: ${slaveId}\n`);
            startSlaveBtn.setEnabled(false);
            stopSlaveBtn.setEnabled(true);

            // 更新从站状态指示器为绿色
            this.isSlaveRunning = true;
            this.updateTabTitles();
        });

        stopSlaveBtn.addEventListener('clicked', () => {
            if (this.modbusServer) {
                this.modbusServer.close(() => {
                    this.slaveLogText!.append(`从站已停止\n`);
                    startSlaveBtn.setEnabled(true);
                    stopSlaveBtn.setEnabled(false);

                    // 更新从站状态指示器为灰色
                    this.isSlaveRunning = false;
                    this.updateTabTitles();
                });
                this.modbusServer = null;
            }
        });

        layout.addWidget(slaveGroup);
        layout.addWidget(displayGroup);
        layout.addWidget(writeGroup);
        layout.addWidget(registerGroup);


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
                    results.push(val.toFixed(4));
                }
                break;
            default:
                results.push(...data.map(val => val.toString()));
        }

        return results.join(", ");
    }


    private validateInputValue(valueStr: string, dataType: string): boolean {
        if (!valueStr || valueStr.trim() === '') {
            return false;
        }

        const trimmedValue = valueStr.trim();

        switch (dataType) {
            case "Bool":
                return trimmedValue === '0' || trimmedValue === '1' ||
                    trimmedValue.toLowerCase() === 'true' || trimmedValue.toLowerCase() === 'false';
            case "Int16":
                const int16 = parseInt(trimmedValue);
                return !isNaN(int16) && int16 >= -32768 && int16 <= 32767;
            case "UInt16":
                const uint16 = parseInt(trimmedValue);
                return !isNaN(uint16) && uint16 >= 0 && uint16 <= 65535;
            case "Int32":
                const int32 = parseInt(trimmedValue);
                return !isNaN(int32) && int32 >= -2147483648 && int32 <= 2147483647;
            case "UInt32":
                const uint32 = parseInt(trimmedValue);
                return !isNaN(uint32) && uint32 >= 0 && uint32 <= 4294967295;
            case "Float32":
                const float32 = parseFloat(trimmedValue);
                return !isNaN(float32) && isFinite(float32) &&
                    Math.abs(float32) <= 3.4028235e+38;
            case "Float64":
                const float64 = parseFloat(trimmedValue);
                return !isNaN(float64) && isFinite(float64) &&
                    Math.abs(float64) <= 1.7976931348623157e+308;
            default:
                return !isNaN(parseFloat(trimmedValue));
        }
    }

    private parseValue(valueStr: string, dataType: string): number | number[] {
        const value = parseFloat(valueStr);

        switch (dataType) {
            case "Bool":
                // Bool类型转换为0或1
                if (valueStr.toLowerCase() === 'true' || valueStr === '1') {
                    return 1;
                } else {
                    return 0;
                }
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
    private startConnectionCheck(): void {
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

                // 更新标签页状态点
                this.updateTabTitles();

                this.updateMenuState();
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

    // 清空所有日志
    private clearAllLogs(): void {
        if (this.masterLogText) {
            this.masterLogText.clear();
        }
        if (this.slaveLogText) {
            this.slaveLogText.clear();
        }
    }

    // 导出日志
    private exportLogs(): void {
        try {
            const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
            const logDir = path.join(__dirname, '../logs');

            // 确保日志目录存在
            if (!fs.existsSync(logDir)) {
                fs.mkdirSync(logDir, { recursive: true });
            }

            let logContent = '';

            // 添加主站日志
            if (this.masterLogText) {
                const masterLog = this.masterLogText.toPlainText();
                if (masterLog.trim()) {
                    logContent += '=== 主站日志 ===\n';
                    logContent += masterLog;
                    logContent += '\n\n';
                }
            }

            // 添加从站日志
            if (this.slaveLogText) {
                const slaveLog = this.slaveLogText.toPlainText();
                if (slaveLog.trim()) {
                    logContent += '=== 从站日志 ===\n';
                    logContent += slaveLog;
                    logContent += '\n\n';
                }
            }

            if (logContent.trim()) {
                const logFile = path.join(logDir, `modbus-logs-${timestamp}.txt`);
                fs.writeFileSync(logFile, logContent, 'utf8');

                // 在主站日志中显示导出成功信息
                if (this.masterLogText) {
                    this.masterLogText.append(`日志已导出到: ${logFile}\n`);
                }
            } else {
                // 在主站日志中显示无日志信息
                if (this.masterLogText) {
                    this.masterLogText.append('没有日志内容可导出\n');
                }
            }
        } catch (error) {
            // 在主站日志中显示导出错误
            if (this.masterLogText) {
                this.masterLogText.append(`导出日志失败: ${error}\n`);
            }
        }
    }

    // 显示日志对话框
    private toggleLogVisibility(): void {
        this.showLogDialog();
    }

    // 创建并显示日志对话框
    private showLogDialog(): void {
        const dialog = new QDialog();
        dialog.setWindowTitle("日志查看器");
        dialog.resize(800, 600);
        dialog.setModal(false);

        const layout = new QBoxLayout(Direction.TopToBottom);
        dialog.setLayout(layout);

        // 创建标签页
        const tabWidget = new QTabWidget();

        // 主站日志标签页（仅在已连接时显示）
        if (this.isConnected && this.masterLogText) {
            const masterLogWidget = new QWidget();
            const masterLayout = new QBoxLayout(Direction.TopToBottom);
            masterLogWidget.setLayout(masterLayout);

            const masterLogDisplay = new QTextEdit();
            masterLogDisplay.setReadOnly(true);
            masterLogDisplay.setPlainText(this.masterLogText.toPlainText());
            masterLogDisplay.setStyleSheet("font-family: 'Courier New', monospace; font-size: 12px; background-color: #f8f8f8;");

            masterLayout.addWidget(masterLogDisplay);
            tabWidget.addTab(masterLogWidget, new QIcon(), "主站日志");
        }

        // 从站日志标签页（仅在从站运行时显示）
        if (this.isSlaveRunning && this.slaveLogText) {
            const slaveLogWidget = new QWidget();
            const slaveLayout = new QBoxLayout(Direction.TopToBottom);
            slaveLogWidget.setLayout(slaveLayout);

            const slaveLogDisplay = new QTextEdit();
            slaveLogDisplay.setReadOnly(true);
            slaveLogDisplay.setPlainText(this.slaveLogText.toPlainText());
            slaveLogDisplay.setStyleSheet("font-family: 'Courier New', monospace; font-size: 12px; background-color: #f8f8f8;");

            slaveLayout.addWidget(slaveLogDisplay);
            tabWidget.addTab(slaveLogWidget, new QIcon(), "从站日志");
        }

        // 如果没有可显示的日志，显示提示信息
        if (!this.isConnected && !this.isSlaveRunning) {
            const noLogWidget = new QWidget();
            const noLogLayout = new QBoxLayout(Direction.TopToBottom);
            noLogWidget.setLayout(noLogLayout);

            const noLogLabel = new QLabel();
            noLogLabel.setText("当前没有可显示的日志\n\n请先连接主站或启动从站服务");
            noLogLabel.setAlignment(0x84); // Qt::AlignCenter
            noLogLabel.setStyleSheet("color: #666; font-size: 14px; padding: 50px;");

            noLogLayout.addWidget(noLogLabel);
            tabWidget.addTab(noLogWidget, new QIcon(), "无日志");
        }

        layout.addWidget(tabWidget);

        // 添加按钮
        const buttonLayout = new QBoxLayout(Direction.LeftToRight);

        const closeBtn = new QPushButton();
        closeBtn.setText("关闭");
        closeBtn.addEventListener('clicked', () => {
            dialog.close();
        });

        buttonLayout.addStretch();
        buttonLayout.addWidget(closeBtn);

        const buttonWidget = new QWidget();
        buttonWidget.setLayout(buttonLayout);
        layout.addWidget(buttonWidget);

        dialog.exec();
    }

    private loadStyleSheet(): void {
        try {
            const cssPath = path.join(__dirname, '../assets/styles.txt');
            const cssContent = fs.readFileSync(cssPath, 'utf8');
            this.win.setStyleSheet(cssContent);
        } catch (error) {
            console.error('Failed to load stylesheet:', error);
            // 如果加载失败，可以使用默认样式或者空样式
            this.win.setStyleSheet('');
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
