chrome.contextMenus.removeAll(function () {
  chrome.contextMenus.create({
    id: 'copy-to-siyuan',
    title: 'Copy to SiYuan',
    contexts: ['selection', 'image'],
  })

  chrome.contextMenus.onClicked.addListener(function (info, tab) {
    if (info.menuItemId === 'copy-to-siyuan') {
      chrome.tabs.sendMessage(tab.id, {
        'func': 'copy',
        'tabId': tab.id,
        'srcUrl': info.srcUrl,
      })
    }
  })
})

chrome.runtime.onMessage.addListener(async (request, sender, sendResponse) => {
  if (request.func !== 'upload-copy') {
    return
  }

  const jsonBlob = await fetch(request.dataURL).then(r => r.blob())
  const requestData = JSON.parse(await jsonBlob.text())
  const fetchFileErr = requestData.fetchFileErr
  const dom = requestData.dom
  const files = requestData.files
  const formData = new FormData()
  formData.append('dom', dom)
  for (const key of Object.keys(files)) {
    const data = files[key].data
    const base64Response = await fetch(data)
    const blob = base64Response.blob()
    formData.append(key, await blob)
  }
  formData.append("notebook", requestData.notebook)

  fetch(requestData.api + '/api/extension/copy', {
    method: 'POST',
    headers: {
      'Authorization': 'Token ' + requestData.token,
    },
    body: formData,
  }).then((response) => {
    if (response.redirected) {
      chrome.tabs.sendMessage(requestData.tabId, {
        'func': 'tip',
        'msg': 'Invalid API token',
        'tip': 'tip',
      })
    }
    return response.json()
  }).then((response) => {
    if (response.code < 0) {
      chrome.tabs.sendMessage(requestData.tabId, {
        'func': 'tip',
        'msg': response.msg,
        'tip': requestData.tip,
      })
      return
    }

    chrome.tabs.sendMessage(requestData.tabId, {
      'func': 'copy2Clipboard',
      'data': response.data.md,
    })

    if ('' !== response.msg && requestData.type !== 'article') {
      chrome.tabs.sendMessage(requestData.tabId, {
        'func': 'tip',
        'msg': response.msg,
        'tip': requestData.tip,
      })
    }

    if (requestData.type === 'article') {
      let title = requestData.title ? ('/' + requestData.title) : 'Untitled'
      title = title.replaceAll("/", "")
      const siteName = requestData.siteName
      const excerpt = requestData.excerpt
      const href = requestData.href
      let linkText = href
      if ("" !== siteName) {
        linkText += " - " + siteName
      }
      let markdown = "---\n\n* " + "[" + linkText + "](" + href + ")\n"
      if ("" !== excerpt) {
        markdown += "* " + excerpt + "\n"
      } else {
        markdown += "\n"
      }
      markdown += "* " + getDateTime() + "\n\n---\n\n" + response.data.md

      let docPath = title
      if(requestData.tagToPath && requestData.tags.length > 0) {   // 如果开启了根据标签来定义文档路径
        docPath = requestData.tags + '/' + title
      }
      fetch(requestData.api + '/api/filetree/createDocWithMd', {
        method: 'POST',
        headers: {
          'Authorization': 'Token ' + requestData.token,
        },
        body: JSON.stringify({
          'notebook': requestData.notebook,
          'path': docPath,
          'markdown': markdown,
        }),
      }).then((response) => {
        return response.json()
      }).then((response) => {
        if (0 === response.code) {
          chrome.tabs.sendMessage(requestData.tabId, {
            'func': 'tip',
            'msg': "Create article successfully",
            'tip': requestData.tip,
          })

          if (fetchFileErr) {
            // 可能因为跨域问题导致下载图片失败，这里调用内核接口 `网络图片转换为本地图片` https://github.com/siyuan-note/siyuan/issues/7224
            fetch(requestData.api + '/api/format/netImg2LocalAssets', {
              method: 'POST',
              headers: {
                'Authorization': 'Token ' + requestData.token,
              },
              body: JSON.stringify({
                'id': response.data,
                'url': requestData.href, // 改进浏览器剪藏扩展转换本地图片成功率 https://github.com/siyuan-note/siyuan/issues/7464
              }),
            })
          }

          // 如果开启了要添加tag，在有设置tag的情况下就给文章继续添加 tag
          if(requestData.addTag && requestData.tags.length > 0) {
            console.log(requestData.tags.substring(requestData.tags.indexOf("/")+1));
            fetch(requestData.api + '/api/attr/setBlockAttrs', {
              method: 'POST',
              headers: {
                'Authorization': 'Token ' + requestData.token,
              },
              body: JSON.stringify({
                'id': response.data,
                'attrs': {
                  "tags": requestData.tags,   // 定制化给自己用。去除一级前缀
                }
              }),
            })
          }
          
        } else {
          chrome.tabs.sendMessage(requestData.tabId, {
            'func': 'tip',
            'msg': response.msg,
            'tip': requestData.tip,
          })
        }
      })
    }
  }).catch((e) => {
    console.warn(e)
  })
})

function getDateTime() {
  const now = new Date();
  const year = now.getFullYear();
  let month = now.getMonth() + 1;
  let day = now.getDate();
  let hour = now.getHours();
  let minute = now.getMinutes();
  let second = now.getSeconds();
  if (month.toString().length === 1) {
    month = '0' + month;
  }
  if (day.toString().length === 1) {
    day = '0' + day;
  }
  if (hour.toString().length === 1) {
    hour = '0' + hour;
  }
  if (minute.toString().length === 1) {
    minute = '0' + minute;
  }
  if (second.toString().length === 1) {
    second = '0' + second;
  }
  return year + '-' + month + '-' + day + ' ' + hour + ':' + minute + ':' + second;
}