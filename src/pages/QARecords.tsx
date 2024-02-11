import React, { useContext, useEffect, useRef, useState } from 'react'
import {
  Grid,
  Badge,
  Col,
  Card,
  Title,
  Text,
  Table,
  TableHead,
  TableHeaderCell,
  TableBody,
  TableRow,
  TableCell,
  Button,
  BarChart,
  Subtitle,
  AreaChart,
  DateRangePickerValue,
} from '@tremor/react'
import {
  Condition,
  Platform,
  QARecord,
  QAQueryFilter,
  ScrapedData
} from '../utils/Types'
import { AppContext } from '../App'
import SearchPanel from '../components/SearchPanel'
import PaginationButton from '../components/PaginationButton'
import ProblemRecordsPanel, { IProblemRecordsPanel } from '../components/ProblemRecordsPanel'
import moment from 'moment'
import {
  FaRotate,
  FaArrowRightArrowLeft,
  FaArrowLeft,
  FaArrowRight,
} from 'react-icons/fa6'
import axios, { AxiosError, AxiosResponse } from 'axios'
import {
  initQARecord,
  server,
  getPlatformBadgeColor,
  renderItemConditionOptions,
  renderPlatformOptions,
  getConditionVariant,
  renderItemPerPageOptions,
  renderMarketPlaceOptions,
  copyLink,
  openLink,
  initQAQueryFilter,
  extractHttpsFromStr
} from '../utils/utils'
import {
  Form,
  InputGroup,
  Modal
} from 'react-bootstrap'
import '../style/QARecords.css'
import TableFilter from '../components/TableFilter'
import PageItemStatsBox from '../components/PageItemStatsBox'
import EditInstockModal from '../components/EditInstockModal'

const valueFormatter = (number: number) => `${new Intl.NumberFormat("us").format(number).toString()}`
const initScrapeData: ScrapedData = { title: '', msrp: 0, imageUrl: '', currency: '' }

// mock data
const barChartData = [
  {
    name: "New",
    "Number of Items": 546,
  },
  {
    name: "Sealed",
    "Number of Items": 120,
  },
  {
    name: "Used Like New",
    "Number of Items": 25,
  },
  {
    name: "Used",
    "Number of Items": 13,
  },
  {
    name: "Damaged",
    "Number of Items": 8,
  },
  {
    name: "As Is",
    "Number of Items": 2,
  }
]

const chartdata = [
  {
    date: "Jan 22",
    Recorded: 2890,
    "QARecorded": 2338,
  },
  {
    date: "Feb 22",
    Recorded: 2756,
    "QARecorded": 2103,
  },
  {
    date: "Mar 22",
    Recorded: 3322,
    "QARecorded": 2194,
  },
  {
    date: "Apr 22",
    Recorded: 3470,
    "QARecorded": 2108,
  },
  {
    date: "May 22",
    Recorded: 3475,
    "QARecorded": 1812,
  },
  {
    date: "Jun 22",
    Recorded: 3129,
    "QARecorded": 1726,
  },
]

const QARecords: React.FC = () => {
  const { setLoading, userInfo } = useContext(AppContext)
  // reference to components
  const ProblemPanelRef = useRef<IProblemRecordsPanel>(null)
  const tableRef = useRef<HTMLDivElement>(null)
  const topRef = useRef<HTMLDivElement>(null)
  // recording panel
  const [QARecordArr, setQARecordArr] = useState<QARecord[]>([])
  const [selectedRecord, setSelectedRecord] = useState<QARecord>(initQARecord)
  const [originalSelectedRecord, setOriginalSelectedRecord] = useState<QARecord>(initQARecord)
  const [selectedRecordImagesArr, setSelectedRecordImagesArr] = useState<string[]>([])
  const [imagePopupUrl, setImagePopupUrl] = useState<string>('')
  // flags
  const [displaySearchRecords, setDisplaySearchRecords] = useState<boolean>(true)
  const [displayProblemRecordsPanel, setDisplayProblemRecordsPanel] = useState<boolean>(true)
  const [showMarkConfirmPopup, setShowMarkConfirmPopup] = useState<boolean>(false)
  const [showImagePopup, setShowImagePopup] = useState<boolean>(false)
  const [flipQACard, setFlipQACard] = useState<boolean>(false)
  const [changed, setChanged] = useState<boolean>(false)
  // paging
  const [currPage, setCurrPage] = useState<number>(0)
  const [itemsPerPage, setItemsPerPage] = useState<number>(20)
  const [itemCount, setItemCount] = useState<number>(0)
  // filtering
  const [queryFilter, setQueryFilter] = useState<QAQueryFilter>(initQAQueryFilter)
  // scraping and chat gpt
  const [scrapeData, setScrapeData] = useState<ScrapedData>({
    title: '',
    msrp: 0,
    imageUrl: '',
    currency: ''
  })

  useEffect(() => {
    fetchQARecordsByPage()
  }, [])

  const getTotalPage = () => Math.ceil(itemCount / itemsPerPage) - 1

  // called on component mount
  const fetchQARecordsByPage = async (isInit?: boolean, newItemsPerPage?: number) => {
    setLoading(true)
    await axios({
      method: 'post',
      url: server + '/adminController/getQARecordsByPage',
      responseType: 'text',
      timeout: 8000,
      data: {
        page: isInit ? 0 : currPage,
        itemsPerPage: newItemsPerPage ?? itemsPerPage,
        filter: isInit ? initQAQueryFilter : queryFilter
      },
      withCredentials: true
    }).then((res: AxiosResponse) => {
      const data = JSON.parse(res.data)
      setQARecordArr(data['arr'])
      setItemCount(data['count'])
      if (changed) setChanged(false)
    }).catch((err) => {
      setQARecordArr([])
      setItemCount(0)
      setLoading(false)
      alert('Failed Fetching QA Records: ' + err.response)
    })
    setLoading(false)
  }

  // put record in problematic list
  const setRecordProblematic = async (sku: string, isProblematic: boolean) => {
    setShowMarkConfirmPopup(false)
    setLoading(true)
    await axios({
      method: 'patch',
      url: server + '/adminController/setProblematicBySku/' + sku,
      responseType: 'text',
      timeout: 8000,
      data: { 'isProblem': isProblematic },
      withCredentials: true
    }).then(() => {
      // refresh
    }).catch((err) => {
      setLoading(false)
      alert('Failed Fetching QA Records: ' + err.response.status)
    })
    setLoading(false)
    fetchQARecordsByPage()
    ProblemPanelRef.current?.fetchProblemRecords()
    setSelectedRecord(initQARecord)
  }

  // get image url from Azure Blob Storage
  const fetchImageUrlArr = async () => {
    setLoading(true)
    await axios({
      method: 'post',
      url: server + '/imageController/getUrlsBySku',
      responseType: 'text',
      timeout: 8000,
      data: { 'sku': String(selectedRecord.sku) },
      withCredentials: true
    }).then((res) => {
      setSelectedRecordImagesArr(JSON.parse(res.data))
    }).catch((res: AxiosError) => {
      setLoading(false)
      alert('Failed Fetching Image: ' + res.response?.data)
    })
    setLoading(false)
  }

  const pageAxios = async (newPage: number) => {
    await axios({
      method: 'post',
      url: server + '/adminController/getQARecordsByPage',
      responseType: 'text',
      timeout: 8000,
      data: {
        page: newPage,
        itemsPerPage: itemsPerPage,
        filter: queryFilter
      },
      withCredentials: true
    }).then((res: AxiosResponse) => {
      const data = JSON.parse(res.data)
      if (data['arr'] && data['arr'].length > 0) {
        setQARecordArr(data['arr'])
        setCurrPage(newPage)
        setChanged(false)
      }
    }).catch((res: AxiosError) => {
      setLoading(false)
      alert('Cannot get page: ' + res.status)
    })
  }

  // for next and prev page button
  const fetchPage = async (direction: number) => {
    // direction for page turning
    let newPage = 0
    if (direction > 0) {
      if (currPage + 1 > getTotalPage()) return
      newPage = currPage + 1
    } else {
      if (currPage - 1 < 0) return
      newPage = currPage - 1
    }
    scrollToTable()
    setLoading(true)
    pageAxios(newPage)
    setLoading(false)
  }

  // jump to first or last page
  const gotoFirstLastPage = async (direction: number) => {
    // goto fist or last page
    let newPage = 0
    if (direction > 0) {
      if (currPage === getTotalPage()) return
      newPage = getTotalPage()
    } else {
      if (currPage === 0) return
      newPage = 0
    }
    scrollToTable()
    setLoading(true)
    pageAxios(newPage)
    setLoading(false)
  }

  // control panel cursor jump to record
  const nextRecord = () => {
    const next = QARecordArr[QARecordArr.indexOf(selectedRecord) + 1]
    setSelectedRecordImagesArr([])
    if (next !== undefined) setSelectedRecord(next); setOriginalSelectedRecord(next); setScrapeData(initScrapeData)
  }

  const prevRecord = () => {
    const prev = QARecordArr[QARecordArr.indexOf(selectedRecord) - 1]
    setSelectedRecordImagesArr([])
    if (prev !== undefined) setSelectedRecord(prev); setOriginalSelectedRecord(prev); setScrapeData(initScrapeData)
  }

  // take QA record scrape and generate info, then push data into instock inventory db
  const renderRecordingPanel = () => {
    const record = async () => {
      // call admin create in stock inventory

    }

    const onConditionChange = (event: React.ChangeEvent<HTMLSelectElement>) => setSelectedRecord({ ...selectedRecord, itemCondition: event.target.value as Condition })
    const onOwnerChange = (event: React.ChangeEvent<HTMLInputElement>) => setSelectedRecord({ ...selectedRecord, ownerName: event.target.value })
    const onShelfLocationChange = (event: React.ChangeEvent<HTMLInputElement>) => {
      if (event.target.value.length < 5) setSelectedRecord({ ...selectedRecord, shelfLocation: event.target.value })
    }
    const onMarketplaceChange = (event: React.ChangeEvent<HTMLSelectElement>) => {
      setSelectedRecord({ ...selectedRecord, marketplace: event.target.value as Platform })
    }
    const onAmountChange = (event: React.ChangeEvent<HTMLInputElement>) => {
      if (event.target.value.length < 3) setSelectedRecord({ ...selectedRecord, amount: Number(event.target.value) })
    }
    const onCommentChange = (event: React.ChangeEvent<HTMLInputElement>) => {
      if (event.target.value.length < 100) setSelectedRecord({ ...selectedRecord, comment: event.target.value })
    }
    const onLinkChange = (event: React.ChangeEvent<HTMLInputElement>) => setSelectedRecord({ ...selectedRecord, comment: event.target.value })
    const onPlatformChange = (event: React.ChangeEvent<HTMLSelectElement>) => setSelectedRecord({ ...selectedRecord, platform: event.target.value as Platform })

    const clearImagePopup = () => {
      setImagePopupUrl('')
      setShowImagePopup(false)
    }

    // full size image popup
    const renderImageModal = () => {
      const gotoImage = (pos: number) => {
        if (pos > 0) {
          const next = selectedRecordImagesArr[selectedRecordImagesArr.indexOf(imagePopupUrl) + 1]
          if (!next) return
          setImagePopupUrl(next)
        } else {
          const prev = selectedRecordImagesArr[selectedRecordImagesArr.indexOf(imagePopupUrl) - 1]
          if (!prev) return
          setImagePopupUrl(prev)
        }
      }

      return (
        <Modal
          show={showImagePopup}
          onHide={clearImagePopup}
          size='lg'
          keyboard={false}
        >
          <Modal.Header closeButton>
            <Modal.Title className='text-white font-bold'>{selectedRecord.sku}</Modal.Title>
            <p className='absolute text-rose-500 top-12 left-3'>{imagePopupUrl.replace(/^.*[\\/]/, '')}</p>
          </Modal.Header>
          <Modal.Body>
            <div className='flex min-h-96'>
              <Button className='absolute h-48 left-6 top-1/2 opacity-30 rounded-full' color='gray' onClick={() => gotoImage(-1)}>
                <FaArrowLeft />
              </Button>
              <img className='m-auto mr-6 ml-6' src={imagePopupUrl} />
              <Button className='absolute h-48 right-6 top-1/2 opacity-30 rounded-full' color='gray' onClick={() => gotoImage(1)}>
                <FaArrowRight />
              </Button>
            </div>
          </Modal.Body>
          <Modal.Footer>
            <Button color='slate' onClick={clearImagePopup}>
              Close
            </Button>
            <Button color='emerald' onClick={() => openLink(imagePopupUrl)}>
              Download
            </Button>
          </Modal.Footer>
        </Modal>
      )
    }

    // populate thumbnails gallery with url in url array
    const renderThumbnails = () => {
      return selectedRecordImagesArr.map((link: string) =>
        <img src={link} key={link} width={200} className='max-h-[300px]' onClick={() => { setShowImagePopup(true); setImagePopupUrl(link) }} />
      )
    }

    // confirm model to set record problematic
    const renderConfirmModal = () => {
      return (
        <Modal
          show={showMarkConfirmPopup}
          onHide={() => setShowMarkConfirmPopup(false)}
          backdrop="static"
          keyboard={false}
        >
          <Modal.Header closeButton>
            <Modal.Title>Record {selectedRecord.sku}</Modal.Title>
          </Modal.Header>
          <Modal.Body>
            Set this record {selectedRecord.problem ? ' resolved' : ' problematic'}?
          </Modal.Body>
          <Modal.Footer>
            <Button color='slate' onClick={() => setShowMarkConfirmPopup(false)}>
              Close
            </Button>
            {
              selectedRecord.problem ?
                <Button color='lime' onClick={() => setRecordProblematic(String(selectedRecord.sku), false)}>Confirm</Button> :
                <Button color='red' onClick={() => setRecordProblematic(String(selectedRecord.sku), true)}>Confirm</Button>
            }
          </Modal.Footer>
        </Modal>
      )
    }

    // selected QA record information card
    const renderQARecordCard = () => {
      // A side contains QA info
      const renderA = () => (
        <div className='min-h-[500px]'>
          <InputGroup size="sm" className="mb-3">
            <InputGroup.Text>Admin</InputGroup.Text>
            <Form.Control style={{ color: 'orange' }} value={userInfo.name} readOnly disabled />
          </InputGroup>
          <InputGroup size="sm" className="mb-3">
            <InputGroup.Text>Q&A Personal</InputGroup.Text>
            <Form.Control value={selectedRecord.ownerName} onChange={onOwnerChange} />
          </InputGroup>
          <InputGroup size="sm" className="mb-3">
            <InputGroup.Text>Shelf Location</InputGroup.Text>
            <Form.Control value={selectedRecord.shelfLocation} onChange={onShelfLocationChange} />
          </InputGroup>
          <InputGroup size="sm" className="mb-3" >
            <InputGroup.Text>Item Condition</InputGroup.Text>
            <Form.Select value={selectedRecord.itemCondition} onChange={onConditionChange}>
              {renderItemConditionOptions()}
            </Form.Select>
          </InputGroup>
          <InputGroup size="sm" className="mb-3">
            <InputGroup.Text>Original Platform</InputGroup.Text>
            <Form.Select value={selectedRecord.platform} onChange={onPlatformChange}>
              {renderPlatformOptions()}
            </Form.Select>
          </InputGroup>
          <InputGroup size="sm" className="mb-3">
            <InputGroup.Text>Target Marketplace</InputGroup.Text>
            <Form.Select value={selectedRecord.marketplace} onChange={onMarketplaceChange}>
              {renderMarketPlaceOptions()}
            </Form.Select>
          </InputGroup>
          <InputGroup size="sm" className="mb-3">
            <InputGroup.Text>Amount</InputGroup.Text>
            <Form.Control value={selectedRecord.amount} onChange={onAmountChange} />
          </InputGroup>
          <InputGroup size="sm" className="mb-3">
            <InputGroup.Text>Comment</InputGroup.Text>
            <Form.Control
              className='resize-none h-32'
              as="textarea"
              value={selectedRecord.comment}
              onChange={onCommentChange}
            />
          </InputGroup>
          <InputGroup size="sm" className="mb-12">
            <InputGroup.Text>Link</InputGroup.Text>
            <Form.Control
              className='resize-none h-32'
              as="textarea"
              value={selectedRecord.link}
              onChange={onLinkChange}
            />
            <Button size='xs' color='slate' onClick={() => setSelectedRecord({ ...selectedRecord, link: extractHttpsFromStr(selectedRecord.link) })}>Extract</Button>
            <Button size='xs' color='gray' onClick={() => openLink(selectedRecord.link)}>Open</Button>
          </InputGroup>
        </div>
      )

      const scrapeRequest = async () => {
        setLoading(true)
        await axios({
          method: 'post',
          url: server + '/inventoryController/scrapeInfoBySkuAmazon',
          responseType: 'text',
          timeout: 12000,   // scraping takes longer time
          data: { 'sku': String(selectedRecord.sku) },
          withCredentials: true
        }).then((res: AxiosResponse) => {
          setScrapeData(JSON.parse(res.data))
        }).catch((res: AxiosError) => {
          alert('Failed Scraping: ' + res.response?.data)
        })
        setLoading(false)
      }

      const onMsrpChange = (event: React.ChangeEvent<HTMLInputElement>) => setScrapeData({ ...scrapeData, msrp: Number(event.target.value) })
      const onTitleChange = (event: React.ChangeEvent<HTMLInputElement>) => setScrapeData({ ...scrapeData, title: event.target.value })
      const onCurrencyChange = (event: React.ChangeEvent<HTMLInputElement>) => setScrapeData({ ...scrapeData, currency: event.target.value })
      // push image to azure blob storage
      const pushImage = () => {
        // send image url to server
        // server fetch from the url and push it into blob storage

      }

      // scraped data: msrp, title, first image
      // chatgpt data: lead, description
      // B side contains web scraper and chat gpt results
      const renderB = () => (
        <div className='min-h-[500px]'>
          <div className='flex m-2'>
            <Badge color={getPlatformBadgeColor(selectedRecord.platform)}>{selectedRecord.platform}</Badge>
          </div>
          <InputGroup size="sm" className="mb-3">
            <InputGroup.Text>Title</InputGroup.Text>
            <Form.Control
              className='resize-none h-32'
              as="textarea"
              value={scrapeData.title}
              onChange={onTitleChange}
            />
          </InputGroup>
          <Grid numItems={4}>
            <Col numColSpan={3}>
              <InputGroup size="sm" className="mb-3">
                <InputGroup.Text>MSRP</InputGroup.Text>
                <Form.Control value={scrapeData.msrp} onChange={onMsrpChange} />
              </InputGroup>
              <InputGroup size="sm" className="mb-3">
                <InputGroup.Text>Currency Type</InputGroup.Text>
                <Form.Control value={scrapeData.currency} onChange={onCurrencyChange} />
              </InputGroup>
            </Col>
            <Col numColSpan={1}>
              <Button className='ml-2' color='emerald' onClick={scrapeRequest}>Scrape</Button>
            </Col>
          </Grid>
          <div>
            <p>First Stock Image:</p>
            {scrapeData.imageUrl ?? undefined}
            {/* {scrapeData.imageUrl ? <img src={scrapeData.imageUrl} /> : undefined} */}
            <img src={scrapeData.imageUrl} />
          </div>
          <hr />
        </div>
      )

      return (
        <Card className='h-fit mb-12' style={{ backgroundColor: '#223' }}>
          {flipQACard ? renderB() : renderA()}
        </Card>
      )
    }

    return (
      <div className='h-full'>
        <div className='flex'>
          {renderImageModal()}
          {renderConfirmModal()}
          <div className='w-1/2 p-3 pt-0'>
            <div className='flex'>
              <h2 className={`mb-3 font-bold ${selectedRecord.problem ? 'text-red-500' : selectedRecord.recorded ? 'text-emerald-500' : ''}`} >
                {`${selectedRecord.recorded ? '✅' : ''}${selectedRecord.sku}`}
              </h2>
              <Button
                color='rose'
                className='absolute right-2/3 mt-2'
                onClick={() => setFlipQACard(!flipQACard)}
                tooltip='Flip Card'
              >
                <FaArrowRightArrowLeft />
                Flip to Back
              </Button>
            </div>
            {renderQARecordCard()}
          </div>
          <div className='w-1/2 mb-10'>
            <div className='flex'>
              <h2>📷 Photos</h2>
              <Button
                className='absolute right-8 mt-2'
                color='indigo'
                tooltip='Fetch Photos'
                onClick={() => fetchImageUrlArr()}
              >
                <FaRotate />
              </Button>
            </div>
            <hr />
            <Card className='overflow-y-scroll inline-grid min-h-[520px]' style={{ backgroundColor: '#223' }}>
              {selectedRecordImagesArr.length < 1 ? <Subtitle>Photos Uploaded By Q&A Personal Will Show Up Here</Subtitle> : <div className='grid grid-cols-3 gap-2'>{renderThumbnails()}</div>}
            </Card>
          </div>
        </div>
        <div className='absolute bottom-3 w-full'>
          <Button color='indigo' onClick={prevRecord}>Prev</Button>
          <Button className='ml-12' color={selectedRecord.problem ? 'lime' : 'rose'} onClick={() => setShowMarkConfirmPopup(true)}>{selectedRecord.problem ? 'Mark Resolved' : 'Mark Problem'}</Button>
          {selectedRecord.recorded ?? <Button className='absolute mr-auto ml-96' color='emerald' onClick={record}>👌 Submit Into Inventory</Button>}
          <Button className='absolute right-12' color='indigo' onClick={nextRecord}>Next</Button>
        </div>
      </div>
    )
  }

  const setSelectedRecordByRecord = async (record: QARecord) => {
    setSelectedRecord(record)
    setOriginalSelectedRecord(record)
    scrollToTop()
    setSelectedRecordImagesArr([])

    // fetch images
    setLoading(true)
    await axios({
      method: 'post',
      url: server + '/imageController/getUrlsBySku',
      responseType: 'text',
      timeout: 8000,
      data: { 'sku': String(record.sku) },
      withCredentials: true
    }).then((res) => {
      setSelectedRecordImagesArr(JSON.parse(res.data))
    }).catch((res: AxiosError) => {
      setLoading(false)
      throw res.response?.data
    })
    setLoading(false)
  }

  const renderInventoryTableBody = () => {
    return (
      <TableBody>
        {QARecordArr?.map((record) => (
          <TableRow key={record.sku}>
            <TableCell>
              <p className={'absolute left-3 text-lg ' + (record.sku === selectedRecord.sku ? 'visible' : 'invisible')}>👉</p>
              <Button
                className={'text-white'}
                color={record.problem ? 'rose' : record.recorded ? 'emerald' : 'slate'}
                tooltip={record.problem ? 'This Record Have Problem' : record.recorded ? 'Already Recorded' : 'Not Recorded'}
                onClick={() => setSelectedRecordByRecord(record)}
              >
                {record.sku}
              </Button>
            </TableCell>
            <TableCell>
              <Text>{record.ownerName}</Text>
            </TableCell>
            <TableCell>
              <Badge color='slate'>{record.shelfLocation}</Badge>
            </TableCell>
            <TableCell>
              <Badge color={getConditionVariant(record.itemCondition)}>{record.itemCondition}</Badge>
            </TableCell>
            <TableCell>
              <p className='text-white-500'>{record.comment}</p>
            </TableCell>
            <TableCell>
              <p><a className='cursor-pointer' onClick={() => openLink(record.link)}>{record.link.slice(0, 50)}</a></p>
            </TableCell>
            <TableCell>
              <Badge color={getPlatformBadgeColor(record.platform)}>{record.platform}</Badge>
            </TableCell>
            <TableCell>
              <Badge color={getPlatformBadgeColor(record.marketplace ?? 'None')}>{record.marketplace}</Badge>
            </TableCell>
            <TableCell>
              <Text>{record.amount}</Text>
            </TableCell>
            <TableCell>
              <Text>{moment(record.time).format('LLL')}</Text>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    )
  }

  const renderTopOverViewChart = () => {
    return (
      <>
        <Title>Overview</Title>
        <Subtitle>Last 7 Days (Dec 7 - Dec 14)</Subtitle>
        <BarChart
          className="h-64"
          data={barChartData}
          index="name"
          categories={["Number of Items"]}
          colors={["rose"]}
          valueFormatter={valueFormatter}
          yAxisWidth={32}
          showAnimation={true}
        />
      </>
    )
  }

  const renderBottomOverviewChart = () => {
    return (
      <>
        <Title>Compare QA Records and Recorded Records</Title>
        <Subtitle>Last 7 Days (Dec 7 - Dec 14)</Subtitle>
        <AreaChart
          className="h-64"
          data={chartdata}
          index="date"
          categories={["Recorded", "QARecorded"]}
          colors={["green", "red"]}
          valueFormatter={valueFormatter}
          showAnimation={true}
        />
      </>
    )
  }

  const scrollToTable = () => {
    if (tableRef.current) tableRef.current.scrollIntoView({
      behavior: 'instant'
    })
  }

  const scrollToTop = () => {
    if (topRef.current) topRef.current.scrollIntoView({
      behavior: 'instant'
    })
  }

  const renderFilter = () => {
    const onPlatformFilterChange = (event: React.ChangeEvent<HTMLSelectElement>) => { setQueryFilter({ ...queryFilter, platformFilter: event.target.value }); setChanged(true) }
    const onConditionFilterChange = (event: React.ChangeEvent<HTMLSelectElement>) => { setQueryFilter({ ...queryFilter, conditionFilter: event.target.value }); setChanged(true) }
    const onMarketplaceFilterChange = (event: React.ChangeEvent<HTMLSelectElement>) => { setQueryFilter({ ...queryFilter, marketplaceFilter: event.target.value }); setChanged(true) }
    const onTimeRangeFilterChange = (value: DateRangePickerValue) => { setQueryFilter({ ...queryFilter, timeRangeFilter: value }); setChanged(true); console.log(value) }
    const resetFilters = () => {
      setQueryFilter(initQAQueryFilter)
      setCurrPage(0)
      setChanged(false)
      fetchQARecordsByPage(true)
    }

    return (
      <div className='flex mb-4'>
        <Button
          className='text-white absolute mt-4'
          color={changed ? 'amber' : 'emerald'}
          onClick={() => { fetchQARecordsByPage(false); setCurrPage(0) }}
          tooltip='Refresh QA Records Table'
        >
          <FaRotate />
        </Button>
        <TableFilter
          queryFilter={queryFilter}
          setQueryFilter={setQueryFilter}
          onTimeRangeFilterChange={onTimeRangeFilterChange}
          onConditionFilterChange={onConditionFilterChange}
          onPlatformFilterChange={onPlatformFilterChange}
          onMarketplaceFilterChange={onMarketplaceFilterChange}
          resetFilters={resetFilters}
        />
        <PageItemStatsBox
          totalItems={itemCount}
          itemsPerPage={itemsPerPage}
          onItemsPerPageChange={onItemsPerPageChange}
        />
      </div>
    )
  }

  const renderPlaceHolder = () => {
    if (!QARecordArr || !QARecordArr.length) return <h4 className='text-red-400 w-max ml-auto mr-auto mt-12 mb-12'>No Q&A Records Found!</h4>
  }

  const onItemsPerPageChange = (event: React.ChangeEvent<HTMLSelectElement>) => {
    setCurrPage(0)
    setItemsPerPage(Number(event.target.value))
    fetchQARecordsByPage(true, Number(event.target.value))
  }

  return (
    <div ref={topRef}>
      {/* control panels */}
      <Grid className="gap-2" numItems={3}>
        <Col numColSpan={2}>
          <Card className="h-full">
            <Title>📥 Inventory Recording</Title>
            {selectedRecord.sku ? <Button className='absolute right-8 top-6' color='emerald' onClick={() => setSelectedRecord(originalSelectedRecord)}>Reset Inventory</Button> : undefined}
            <hr />
            {selectedRecord.sku === 0 ? <Subtitle className='text-center mt-64'>Selected QA Records Details Will Be Shown Here!</Subtitle> : renderRecordingPanel()}
          </Card>
        </Col>
        <Col numColSpan={1} className='h-full'>
          <Card className="h-96 bg-stone-900">
            <Button
              color='rose'
              className='right-6 absolute p-2'
              onClick={() => setDisplaySearchRecords(!displaySearchRecords)}
              tooltip='Flip Card'
            >
              <FaArrowRightArrowLeft />
            </Button>
            {displaySearchRecords ? <SearchPanel setSelectedRecord={setSelectedRecordByRecord} /> : renderTopOverViewChart()}
          </Card>
          <Card className="h-96 mt-2">
            <Button
              color='rose'
              className='right-6 absolute p-2'
              onClick={() => setDisplayProblemRecordsPanel(!displayProblemRecordsPanel)}
              tooltip='Flip Card'
            >
              <FaArrowRightArrowLeft />
            </Button>
            {
              displayProblemRecordsPanel ?
                <ProblemRecordsPanel
                  ref={ProblemPanelRef}
                  setSelectedRecord={setSelectedRecordByRecord}
                  setSelectedRecordImagesArr={setSelectedRecordImagesArr}
                /> : renderBottomOverviewChart()
            }
          </Card>
        </Col>
      </Grid>
      {/* table */}
      <Card className='mt-2 max-w-full'>
        <div ref={tableRef}></div>
        {renderFilter()}
        <PaginationButton
          totalPage={getTotalPage()}
          currentPage={currPage}
          nextPage={() => fetchPage(1)}
          prevPage={() => fetchPage(-1)}
          firstPage={() => gotoFirstLastPage(-1)}
          lastPage={() => gotoFirstLastPage(1)}
        />
        <hr />
        <Table>
          <TableHead>
            <TableRow className='th-row'>
              <TableHeaderCell>SKU</TableHeaderCell>
              <TableHeaderCell className='w-36'>Owner</TableHeaderCell>
              <TableHeaderCell className='w-36'>Shelf Location</TableHeaderCell>
              <TableHeaderCell className='w-36'>Condition</TableHeaderCell>
              <TableHeaderCell>Comment</TableHeaderCell>
              <TableHeaderCell>Link</TableHeaderCell>
              <TableHeaderCell>Platform</TableHeaderCell>
              <TableHeaderCell>Target Marketplace</TableHeaderCell>
              <TableHeaderCell className='w-36'>Amount</TableHeaderCell>
              <TableHeaderCell>Time Created</TableHeaderCell>
            </TableRow>
          </TableHead>
          {renderInventoryTableBody()}
        </Table>
        {/* p cannot be a child of table */}
        {renderPlaceHolder()}
        <hr />
        <PaginationButton
          totalPage={getTotalPage()}
          currentPage={currPage}
          nextPage={() => fetchPage(1)}
          prevPage={() => fetchPage(-1)}
          firstPage={() => gotoFirstLastPage(-1)}
          lastPage={() => gotoFirstLastPage(1)}
        />
      </Card>
    </div>
  )
}
export default QARecords
